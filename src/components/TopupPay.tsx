'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, rp, setMeBalance } from '@/lib/client';

function useCountdown(deadline: number | null) {
    const [left, setLeft] = useState(0);
    useEffect(() => {
        if (!deadline) return;
        const t = () => setLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
        t();
        const id = setInterval(t, 1000);
        return () => clearInterval(id);
    }, [deadline]);
    return left;
}

export default function TopupPay({ invoice }: { invoice: string }) {
    const router = useRouter();
    const [t, setT] = useState<any>(null);
    const [err, setErr] = useState('');
    const tries = useRef(0);

    useEffect(() => {
        let alive = true;
        let timer: any;
        const tick = async () => {
            const r: any = await api(`/api/wallet/topup/${invoice}`);
            if (!alive) return;
            if (r.status === 401) return router.replace(`/login?next=/topup/${invoice}`);
            if (!r.success) return setErr(r.message || 'Tagihan tidak ditemukan.');
            setT(r.topup);
            if (r.topup.status === 'PAID') { setMeBalance(r.balance); return; }
            if (r.topup.status !== 'PENDING') return;
            tries.current++;
            // Polling hemat: 5 dtk di awal, melambat bertahap (maks 20 dtk) — hemat invocation Vercel
            timer = setTimeout(tick, Math.min(5000 + tries.current * 1000, 20000));
        };
        tick();
        return () => { alive = false; clearTimeout(timer); };
    }, [invoice, router]);

    const created = t ? new Date(t.created_at).getTime() : 0;
    const exp = t?.payment?.expired ? new Date(String(t.payment.expired).replace(' ', 'T')).getTime() : NaN;
    const deadline = t ? (Number.isFinite(exp) && exp > created ? exp : created + 15 * 60_000) : null;
    const left = useCountdown(deadline);
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');

    if (err) return <div className="kx-wrap"><div className="state-box bad"><div className="big"><i className="fa-solid fa-triangle-exclamation" /></div><h2>{err}</h2><div className="ord-actions"><Link className="btn-ghost" href="/dashboard">Kembali ke Dashboard</Link></div></div></div>;
    if (!t) return <div className="kx-wrap"><div className="kx-empty">Memuat tagihan...</div></div>;

    const p = t.payment || {};
    if (t.status === 'PAID') {
        return (
            <div className="ord ord-body" style={{ minHeight: 0, background: 'transparent' }}>
                <div className="ok-wrap">
                    <div className="ok-ico"><i className="fa-solid fa-check" /></div>
                    <h2>Saldo Masuk!</h2>
                    <p>+{rp(t.amount)} sudah ditambahkan ke saldo kamu.</p>
                </div>
                <div className="ord-actions">
                    <Link className="btn-cy" href="/produk"><i className="fa-solid fa-cart-shopping" /> Belanja Sekarang</Link>
                    <Link className="btn-ghost" href="/dashboard">Ke Dashboard</Link>
                </div>
            </div>
        );
    }
    if (t.status !== 'PENDING' || left === 0) {
        return (
            <div className="kx-wrap"><div className="state-box bad"><div className="big"><i className="fa-solid fa-clock" /></div><h2>Tagihan Kedaluwarsa</h2><p>Tagihan ini sudah tidak berlaku. Jika kamu sudah transfer, saldo tetap akan masuk otomatis begitu pembayaran terkonfirmasi.</p>
                <div className="ord-actions"><Link className="btn-cy" href="/dashboard#topup">Buat Tagihan Baru</Link></div></div></div>
        );
    }

    return (
        <div className="ord ord-body" style={{ minHeight: 0, background: 'transparent' }}>
            <div className="ord-pad">
                <div className="pay-head"><h2><i className="fa-solid fa-qrcode" /> Isi Saldo</h2><span className="m">{t.payment_name}</span></div>
                <div className="countdown-lab">Selesaikan pembayaran dalam</div>
                <div className="cd"><span>{mm}</span><i>:</i><span>{ss}</span></div>

                {p.qr_image && <div className="qr-frame"><div className="qr-box"><img src={p.qr_image} alt="QRIS" /></div></div>}
                {(p.nomor_va || p.nomor_pembayaran) && <div className="sum-box" style={{ marginTop: 18, justifyContent: 'center' }}>{p.nomor_va || p.nomor_pembayaran}</div>}
                {p.pay_address && <div className="sum-box" style={{ marginTop: 18, wordBreak: 'break-all' }}>{p.pay_address}<br />{p.pay_amount} {p.pay_currency}</div>}

                <div className="tot-lab">Total Pembayaran</div>
                <div className="tot-val">{rp(t.total_amount)}</div>

                <div className="det" style={{ padding: '18px 0 0' }}>
                    <div className="det-row"><span>Saldo yang masuk</span><b>{rp(t.amount)}</b></div>
                    <div className="det-row"><span>Biaya gateway</span><b>{rp(t.fee)}</b></div>
                    <div className="det-row"><span>Invoice</span><b>{t.invoice_no}</b></div>
                </div>
                <p className="watch"><i className="fa-solid fa-circle-notch fa-spin" /> Menunggu pembayaran… halaman ini otomatis berubah saat saldo masuk.</p>
                {p.tutorial_pembayaran && (
                    <div className="how-qr"><h3><i className="fa-solid fa-circle-info" /> Cara Bayar</h3>
                        <ul>{String(p.tutorial_pembayaran).split(/\r?\n/).filter(Boolean).map((l: string, i: number) => <li key={i}><i>{i + 1}</i>{l.replace(/^\d+\.\s*/, '')}</li>)}</ul>
                    </div>
                )}
            </div>
        </div>
    );
}
