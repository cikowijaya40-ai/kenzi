'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, refreshMe, rp, setMeBalance } from '@/lib/client';

const KIND: Record<string, [string, string]> = {
    topup: ['fa-arrow-down', 'Isi Saldo'], purchase: ['fa-cart-shopping', 'Pembelian'],
    refund: ['fa-rotate-left', 'Refund'], admin_adjust: ['fa-user-shield', 'Penyesuaian'],
};
const dt = (s: string) => new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const tagOf = (s: string) => (s === 'PAID' ? 'done' : s === 'PENDING' ? 'pending' : 'expired');

export default function Dashboard() {
    const router = useRouter();
    const [d, setD] = useState<any>(null);
    const [tab, setTab] = useState<'orders' | 'ledger' | 'topups' | 'akun'>('orders');
    const [amount, setAmount] = useState('');
    const [channels, setChannels] = useState<any[]>([]);
    const [code, setCode] = useState('QRIS');
    const [lim, setLim] = useState({ min: 10000, max: 5000000 });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
    const [pwMsg, setPwMsg] = useState('');
    const [un, setUn] = useState({ username: '', currentPassword: '' });
    const [unMsg, setUnMsg] = useState('');

    const load = useCallback(async () => {
        const r: any = await api('/api/dashboard');
        if (r.status === 401) return router.replace('/login?next=/dashboard');
        if (r.success) { setD(r); setMeBalance(r.user.balance); }
    }, [router]);

    useEffect(() => {
        load();
        api('/api/wallet/channels').then((r: any) => {
            if (r.success) { setChannels(r.channels || []); setLim({ min: r.min, max: r.max }); if (r.channels?.[0]) setCode((c) => r.channels.find((x: any) => x.code === c) ? c : r.channels[0].code); }
        });
    }, [load]);

    async function topup() {
        const n = Math.trunc(Number(amount));
        if (!n || n < lim.min || n > lim.max) return setErr(`Nominal ${rp(lim.min)} – ${rp(lim.max)}.`);
        setBusy(true); setErr('');
        const r: any = await api('/api/wallet/topup', { method: 'POST', json: { amount: n, paymentCode: code } });
        setBusy(false);
        if (r.success) router.push(`/topup/${r.invoice_no}`);
        else setErr(r.message || 'Gagal membuat tagihan.');
    }

    async function changePw(e: React.FormEvent) {
        e.preventDefault();
        const r: any = await api('/api/auth/password', { method: 'POST', json: pw });
        setPwMsg(r.success ? '✔ Password diganti.' : r.message || 'Gagal.');
        if (r.success) { setPw({ currentPassword: '', newPassword: '' }); load(); }
    }
    async function changeUsername(e: React.FormEvent) {
        e.preventDefault();
        const r: any = await api('/api/auth/username', { method: 'POST', json: un });
        setUnMsg(r.success ? '✔ Username diganti.' : r.message || 'Gagal.');
        if (r.success) { setUn({ username: '', currentPassword: '' }); refreshMe(); load(); }
    }
    async function logout() {
        await api('/api/auth/logout', { method: 'POST' });
        refreshMe(); router.push('/'); router.refresh();
    }

    if (!d) return <div className="kx-wrap"><div className="kx-empty">Memuat dashboard...</div></div>;
    const u = d.user;
    const orders: any[] = d.orders || [];
    const okCount = orders.filter((o) => o.delivery_status === 'DELIVERED').length;
    const pendCount = orders.filter((o) => o.status === 'PENDING').length;
    const spent = orders.filter((o) => o.status === 'PAID').reduce((n, o) => n + Number(o.total_amount || 0), 0);
    const label = (o: any) => (o.delivery_status === 'DELIVERED' ? 'Selesai' : o.status === 'FAILED' ? 'Refund' : o.status === 'EXPIRED' ? 'Kedaluwarsa' : o.status === 'PENDING' ? 'Menunggu bayar' : 'Proses');

    return (
        <div className="kx-wrap kx-dash">
            <div className="kx-profile">
                <div className="av">{u.username.charAt(0).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                    <h1>Halo, {u.username}!</h1>
                    <small>{u.email}</small>
                </div>
                <span className="role"><i className="fa-solid fa-user" /> Member</span>
            </div>

            <div className="kx-wallet" id="topup">
                <div className="top">
                    <div>
                        <small><i className="fa-solid fa-wallet" /> SALDO KAMU</small>
                        <b>{rp(u.balance)}</b>
                    </div>
                    <i className="fa-solid fa-coins big" />
                </div>
                <div className="row">
                    <input inputMode="numeric" placeholder={`Nominal isi saldo (min ${lim.min.toLocaleString('id-ID')})`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
                    <button onClick={topup} disabled={busy}>{busy ? '...' : <><i className="fa-solid fa-plus" /> Isi Saldo</>}</button>
                </div>
                <div className="quick">
                    {[10000, 25000, 50000, 100000, 250000].map((n) => (
                        <button key={n} type="button" onClick={() => setAmount(String(n))}>{n / 1000}rb</button>
                    ))}
                </div>
                {channels.length > 1 && (
                    <div className="pay-seg" style={{ gridTemplateColumns: `repeat(${Math.min(channels.length, 3)},1fr)` }}>
                        {channels.slice(0, 6).map((c) => <button key={c.code} type="button" className={code === c.code ? 'on' : ''} onClick={() => setCode(c.code)}>{c.name}</button>)}
                    </div>
                )}
                {err && <div className="alert on">{err}</div>}
                <p className="hint">Biaya admin gateway ditampilkan di halaman pembayaran. Saldo yang masuk = nominal yang kamu isi.</p>
            </div>

            <div className="kx-stats">
                <div><b>{orders.length}</b><span>Total Order</span></div>
                <div><b className="g">{okCount}</b><span>Berhasil</span></div>
                <div><b className="a">{pendCount}</b><span>Pending</span></div>
                <div><b className="s">{spent >= 1000 ? Math.round(spent / 1000) + 'K' : spent}</b><span>Belanja (Rp)</span></div>
            </div>

            <div className="kx-tabs">
                {([['orders', 'Pesanan', 'fa-receipt'], ['ledger', 'Mutasi Saldo', 'fa-coins'], ['topups', 'Riwayat Isi', 'fa-qrcode'], ['akun', 'Akun', 'fa-user-gear']] as const).map(([k, l, ic]) => (
                    <button key={k} className={`kx-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}><i className={`fa-solid ${ic}`} /> {l}</button>
                ))}
            </div>

            <div className="kx-hist">
                {tab === 'orders' && (orders.length ? orders.map((o: any) => (
                    <Link key={o.invoice_no} href={`/order/${o.invoice_no}`} className="kx-order">
                        <div className="top">
                            <div style={{ minWidth: 0 }}><div className="nm">{o.product_name}</div><div className="id">{o.invoice_no}</div></div>
                            <span className={`badge ${o.delivery_status === 'DELIVERED' ? 'done' : tagOf(o.status)}`}>{label(o)}</span>
                        </div>
                        <div className="meta"><span>{o.item_name} • {dt(o.created_at)}</span><b>{rp(o.total_amount)}</b></div>
                    </Link>
                )) : <div className="kx-empty-state"><i className="fa-solid fa-receipt" />Belum ada pesanan.<br /><Link href="/produk">Mulai belanja sekarang</Link></div>)}

                {tab === 'ledger' && (d.ledger.length ? d.ledger.map((l: any) => (
                    <div key={l.id} className="kx-order">
                        <div className="top">
                            <div style={{ minWidth: 0 }}><div className="nm"><i className={`fa-solid ${KIND[l.kind]?.[0] || 'fa-coins'}`} /> {KIND[l.kind]?.[1] || l.kind}</div><div className="id">{l.note || l.ref}</div></div>
                            <b className={l.amount >= 0 ? 'pos' : 'neg'}>{l.amount >= 0 ? '+' : '-'}{rp(Math.abs(l.amount))}</b>
                        </div>
                        <div className="meta"><span>{dt(l.created_at)}</span><span>Sisa {rp(l.balance_after)}</span></div>
                    </div>
                )) : <div className="kx-empty-state"><i className="fa-solid fa-coins" />Belum ada mutasi saldo.</div>)}

                {tab === 'topups' && (d.topups.length ? d.topups.map((t: any) => (
                    <Link key={t.invoice_no} href={`/topup/${t.invoice_no}`} className="kx-order">
                        <div className="top">
                            <div style={{ minWidth: 0 }}><div className="nm">{t.invoice_no}</div><div className="id">{t.payment_name}</div></div>
                            <span className={`badge ${tagOf(t.status)}`}>{t.status === 'PAID' ? 'Berhasil' : t.status === 'PENDING' ? 'Menunggu' : 'Gagal'}</span>
                        </div>
                        <div className="meta"><span>{dt(t.created_at)}</span><b>{rp(t.amount)}</b></div>
                    </Link>
                )) : <div className="kx-empty-state"><i className="fa-solid fa-qrcode" />Belum ada riwayat isi saldo.</div>)}

                {tab === 'akun' && d.init_cred && (
                    <div className="panel" style={{ marginBottom: 14 }}>
                        <div className="sub-title" style={{ marginTop: 0 }}><i className="fa-solid fa-user-plus" /> Akun otomatis kamu</div>
                        <p style={{ fontSize: 12.5, margin: '0 0 10px', color: 'var(--muted)' }}>Akun ini dibuat otomatis saat pembelian pertama. Segera ganti password agar lebih aman — kartu ini hilang setelah kamu menggantinya.</p>
                        <div className="det-row"><span>Username</span><b>{d.init_cred.username}</b></div>
                        <div className="det-row"><span>Password</span><b>{d.init_cred.password}</b></div>
                    </div>
                )}
                {tab === 'akun' && (
                    <form className="panel" onSubmit={changeUsername} style={{ marginBottom: 14 }}>
                        <div className="sub-title" style={{ marginTop: 0 }}>Ganti Username</div>
                        <label className="f-lab">Username Baru</label>
                        <div className="f-in"><input value={un.username} onChange={(e) => setUn({ ...un, username: e.target.value })} maxLength={20} autoComplete="username" placeholder="3–20 karakter: huruf, angka, _" required /></div>
                        <label className="f-lab">Password Saat Ini</label>
                        <div className="f-in"><input type="password" value={un.currentPassword} onChange={(e) => setUn({ ...un, currentPassword: e.target.value })} autoComplete="current-password" required /></div>
                        {unMsg && <div className="vc-msg" style={{ color: unMsg.startsWith('✔') ? '#16a34a' : '#dc2626' }}>{unMsg}</div>}
                        <button className="btn-pay">Simpan Username</button>
                    </form>
                )}
                {tab === 'akun' && (
                    <form className="panel" onSubmit={changePw}>
                        <div className="sub-title" style={{ marginTop: 0 }}>Ganti Password</div>
                        <label className="f-lab">Password Lama</label>
                        <div className="f-in"><input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" required /></div>
                        <label className="f-lab">Password Baru</label>
                        <div className="f-in"><input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" required /></div>
                        {pwMsg && <div className="vc-msg" style={{ color: pwMsg.startsWith('✔') ? '#16a34a' : '#dc2626' }}>{pwMsg}</div>}
                        <button className="btn-pay">Simpan Password</button>
                        <button type="button" className="btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={logout}><i className="fa-solid fa-right-from-bracket" /> Keluar</button>
                    </form>
                )}
            </div>

            <Link href="/produk" className="kx-btn-full"><i className="fa-solid fa-bag-shopping" /> Belanja</Link>
        </div>
    );
}
