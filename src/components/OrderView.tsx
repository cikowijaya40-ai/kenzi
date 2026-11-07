'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, rp } from '@/lib/client';

const STATUS: Record<string, [string, string]> = {
    DELIVERED: ['LUNAS • SELESAI', 'ok'], PAID: ['LUNAS • DIPROSES', 'wait'], FAILED: ['DIBATALKAN • REFUND', 'bad'],
    PENDING: ['MENUNGGU BAYAR', 'wait'], EXPIRED: ['KEDALUWARSA', 'bad'], CANCELLED: ['DIBATALKAN', 'bad'],
};

/** Batas waktu bayar: expired dari gateway, atau 15 menit sejak dibuat. */
function orderDeadline(o: any): number {
    const created = new Date(o.created_at).getTime();
    const exp = o?.payment?.expired ? new Date(String(o.payment.expired).replace(' ', 'T')).getTime() : NaN;
    return Number.isFinite(exp) && exp > created ? exp : created + 15 * 60_000;
}

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

export default function OrderView({ invoice }: { invoice: string }) {
    const router = useRouter();
    const [o, setO] = useState<any>(null);
    const [err, setErr] = useState('');
    const [copied, setCopied] = useState('');
    const tries = useRef(0);

    /* Polling: selama menunggu bayar (atau lunas tapi lisensi belum terkirim).
       Hemat invocation Vercel: melambat bertahap, JEDA saat tab tersembunyi (mis. sedang di aplikasi e-wallet,
       langsung cek lagi begitu tab terlihat), dan berhenti setelah batas bayar lewat. */
    useEffect(() => {
        let alive = true;
        let timer: any;
        let busy = false;
        let paused = false;
        const tick = async (force = false) => {
            if (busy) return;
            if (document.hidden && !force) { paused = true; return; }
            busy = true;
            paused = false;
            try {
                const r: any = await api(`/api/order/${invoice}`);
                if (!alive) return;
                if (r.status === 401) return router.replace(`/login?next=/order/${invoice}`);
                if (!r.success) return setErr(r.message || 'Pesanan tidak ditemukan.');
                setO(r.order);
                const waiting = r.order.status === 'PENDING' || (r.order.status === 'PAID' && r.order.delivery_status !== 'DELIVERED');
                if (!waiting) return;
                tries.current++;
                if (r.order.status === 'PAID' && tries.current > 40) return;
                if (r.order.status === 'PENDING' && Date.now() > orderDeadline(r.order) + 180_000) return; // sudah kedaluwarsa: berhenti
                timer = setTimeout(() => tick(), Math.min(4000 + tries.current * 1000, 15000));
            } finally { busy = false; }
        };
        const onVisible = () => { if (!document.hidden && paused && alive) tick(); };
        document.addEventListener('visibilitychange', onVisible);
        tick(true);
        return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
    }, [invoice, router]);

    const created = o ? new Date(o.created_at).getTime() : 0;
    const exp = o?.payment?.expired ? new Date(String(o.payment.expired).replace(' ', 'T')).getTime() : NaN;
    const deadline = o ? (Number.isFinite(exp) && exp > created ? exp : created + 15 * 60_000) : null;
    const left = useCountdown(deadline);
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');

    async function copy(text: string, tag: string) {
        try { await navigator.clipboard.writeText(text); }
        catch {
            const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
            document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { prompt('Salin manual:', text); } document.body.removeChild(t);
        }
        setCopied(tag); setTimeout(() => setCopied(''), 1800);
    }

    if (err) return <div className="kx-wrap"><div className="state-box bad"><div className="big"><i className="fa-solid fa-triangle-exclamation" /></div><h2>{err}</h2><div className="ord-actions"><Link className="btn-ghost" href="/dashboard">Kembali</Link></div></div></div>;
    if (!o) return <div className="kx-wrap"><div className="kx-empty">Memuat pesanan...</div></div>;

    const keys: string[] = o.keys || [];
    const done = o.delivery_status === 'DELIVERED';
    const st = STATUS[done ? 'DELIVERED' : o.status] || STATUS.PENDING;
    const when = new Date(o.created_at).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
    const isBalance = o.payment_method === 'SALDO';
    const awaitingPay = o.status === 'PENDING' && !isBalance;
    const p = o.payment || {};

    /* ── MENUNGGU PEMBAYARAN: QR langsung tampil ── */
    if (awaitingPay && left > 0) {
        return (
            <div className="ord ord-body" style={{ minHeight: 0, background: 'transparent' }}>
                <div className="ord-pad">
                    <div className="pay-head"><h2><i className="fa-solid fa-qrcode" /> Bayar via QRIS</h2><span className="m">{o.payment_name}</span></div>
                    <div className="countdown-lab">Selesaikan pembayaran dalam</div>
                    <div className="cd"><span>{mm}</span><i>:</i><span>{ss}</span></div>

                    {p.qr_image && <div className="qr-frame"><div className="qr-box"><img src={p.qr_image} alt="QRIS" /></div></div>}
                    {(p.nomor_va || p.nomor_pembayaran) && <div className="sum-box" style={{ marginTop: 18, justifyContent: 'center' }}>{p.nomor_va || p.nomor_pembayaran}</div>}

                    <div className="tot-lab">Total Pembayaran</div>
                    <div className="tot-val">{rp(o.total_amount)}</div>

                    <div className="det" style={{ padding: '18px 0 0' }}>
                        <div className="det-row"><span>Produk</span><b>{o.product_name} — {o.item_name}</b></div>
                        <div className="det-row"><span>Harga</span><b>{rp(o.amount)}</b></div>
                        {o.fee > 0 && <div className="det-row"><span>Biaya layanan</span><b>{rp(o.fee)}</b></div>}
                        <div className="det-row"><span>Invoice</span><b>{o.invoice_no}</b></div>
                    </div>
                    <p className="watch"><i className="fa-solid fa-circle-notch fa-spin" /> Menunggu pembayaran… halaman ini otomatis berubah dan menampilkan lisensi begitu pembayaran terkonfirmasi.</p>
                    {p.tutorial_pembayaran && (
                        <div className="how-qr"><h3><i className="fa-solid fa-circle-info" /> Cara Bayar</h3>
                            <ul>{String(p.tutorial_pembayaran).split(/\r?\n/).filter(Boolean).map((l: string, i: number) => <li key={i}><i>{i + 1}</i>{l.replace(/^\d+\.\s*/, '')}</li>)}</ul>
                        </div>
                    )}
                    <div className="ord-actions" style={{ marginTop: 14 }}>
                        <button className="btn-ghost" onClick={() => copy(o.invoice_no, 'inv')}><i className="fa-solid fa-copy" /> {copied === 'inv' ? 'Invoice Tersalin!' : 'Salin No. Invoice'}</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="ord ord-body" style={{ minHeight: 0, background: 'transparent' }}>
            {done && (
                <div className="ok-wrap no-print" style={{ paddingTop: 30 }}>
                    <div className="ok-ico"><i className="fa-solid fa-check" /></div>
                    <h2>Pembelian Berhasil</h2>
                    <p>Salin lisensi di bawah dan simpan baik-baik.</p>
                </div>
            )}

            {done && keys.length > 0 && (
                <div className="lic no-print-key">
                    <div className="k">Lisensi / Key {keys.length > 1 ? `(${keys.length})` : ''}</div>
                    <div className="v">{o.product_name} — {o.item_name}</div>
                    {keys.map((k, i) => (
                        <div key={k + i} style={{ marginBottom: 14 }}>
                            <div className="box" style={{ marginBottom: 10 }}>{k}</div>
                            <button className="btn-cy" style={{ height: 52 }} onClick={() => copy(k, 'k' + i)}>
                                <i className={copied === 'k' + i ? 'fa-solid fa-check' : 'fa-solid fa-copy'} /> {copied === 'k' + i ? 'Key Tersalin!' : 'Salin Key'}
                            </button>
                        </div>
                    ))}
                    {keys.length > 1 && <button className="btn-ghost" style={{ width: '100%' }} onClick={() => copy(keys.join('\n'), 'all')}><i className="fa-solid fa-copy" /> {copied === 'all' ? 'Semua Tersalin!' : 'Salin Semua Key'}</button>}
                </div>
            )}

            {/* Akun otomatis (pembeli pertama) */}
            {done && o.account && (
                <div className="lic no-print" style={{ marginTop: 14 }}>
                    <div className="k"><i className="fa-solid fa-user-plus" /> Akun kamu sudah dibuat otomatis</div>
                    <div className="v">Simpan untuk login berikutnya. Kamu bisa ganti username &amp; password di Dashboard → Akun.</div>
                    <div className="det-row"><span>Username</span><b>{o.account.username}</b></div>
                    <div className="box" style={{ margin: '10px 0' }}>{o.account.password}</div>
                    <button className="btn-ghost" style={{ width: '100%' }} onClick={() => copy(`Username: ${o.account.username}\nPassword: ${o.account.password}`, 'acc')}>
                        <i className={copied === 'acc' ? 'fa-solid fa-check' : 'fa-solid fa-copy'} /> {copied === 'acc' ? 'Tersalin!' : 'Salin Username & Password'}
                    </button>
                    <Link className="btn-ghost" style={{ width: '100%', marginTop: 8, display: 'block', textAlign: 'center' }} href="/dashboard">Ganti Password / Username</Link>
                </div>
            )}

            {!done && (
                <div className={`state-box ${o.status === 'FAILED' || o.status === 'EXPIRED' || o.status === 'CANCELLED' ? 'bad' : 'wait'}`}>
                    <div className="big"><i className={o.status === 'FAILED' ? 'fa-solid fa-rotate-left' : o.status === 'EXPIRED' || awaitingPay ? 'fa-solid fa-clock' : 'fa-solid fa-hourglass-half'} /></div>
                    <h2>{o.status === 'FAILED' ? 'Pesanan Dibatalkan' : o.status === 'EXPIRED' || awaitingPay ? 'Pembayaran Kedaluwarsa' : 'Pesanan Diproses'}</h2>
                    <p>{o.message
                        || (o.status === 'FAILED' ? 'Dana kamu sudah dikembalikan ke saldo akun.'
                            : o.status === 'EXPIRED' || awaitingPay ? 'Waktu pembayaran habis. Jika kamu sudah terlanjur membayar, lisensi tetap dikirim otomatis begitu pembayaran terkonfirmasi. Jika belum, buat pesanan baru.'
                                : 'Lisensi sedang disiapkan. Muat ulang halaman ini sebentar lagi, atau hubungi admin bila lebih dari 10 menit.')}</p>
                    {(o.status === 'EXPIRED' || awaitingPay) && <div className="ord-actions"><Link className="btn-cy" href={`/produk/${o.product_slug}`}>Buat Pesanan Baru</Link></div>}
                </div>
            )}

            {/* ===== INVOICE ===== */}
            <div className="det invoice-doc">
                <div className="inv-head">
                    <div>
                        <small style={{ color: '#8a96b3', letterSpacing: '.18em', fontWeight: 700, fontSize: 11 }}>INVOICE</small>
                        <h3 style={{ margin: '4px 0 0', fontSize: 20, wordBreak: 'break-all' }}>{o.invoice_no}</h3>
                    </div>
                    <span className={`pill ${st[1]}`}>{st[0]}</span>
                </div>
                <div className="det-row sep"><span>Tanggal</span><b>{when}</b></div>
                <div className="det-row"><span>Produk</span><b>{o.product_name}</b></div>
                <div className="det-row"><span>Varian</span><b>{o.item_name}</b></div>
                {o.user_id_game && o.user_id_game !== '-' && <div className="det-row"><span>ID Pembeli</span><b>{o.user_id_game}</b></div>}
                <div className="det-row"><span>Metode Bayar</span><b>{o.payment_name}</b></div>
                <div className="det-row"><span>Jumlah</span><b>1 Lisensi</b></div>
                <div className="det-row"><span>Harga</span><b>{rp(o.amount || o.total_amount)}</b></div>
                {o.fee > 0 && <div className="det-row"><span>Biaya layanan</span><b>{rp(o.fee)}</b></div>}
                <div className="det-total"><span>TOTAL DIBAYAR</span><b>{rp(o.total_amount)}</b></div>
                <p style={{ fontSize: 12, color: '#6b7799', marginTop: 12 }}>{isBalance ? 'Dibayar dengan saldo akun. ' : ''}Simpan nomor invoice ini untuk bantuan ke admin.</p>
            </div>

            <div className="ord-actions no-print">
                <button className="btn-ghost" onClick={() => copy(o.invoice_no, 'inv')}><i className="fa-solid fa-copy" /> {copied === 'inv' ? 'Invoice Tersalin!' : 'Salin No. Invoice'}</button>
                <button className="btn-ghost" onClick={() => window.print()}><i className="fa-solid fa-print" /> Cetak / Simpan PDF</button>
                <Link className="btn-ghost" href="/dashboard">Dashboard</Link>
                <Link className="btn-ghost" href="/produk">Belanja Lagi</Link>
            </div>
        </div>
    );
}
