'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const rp = (n: number) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

export default function AdminUsers() {
    const [users, setUsers] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [q, setQ] = useState('');
    const [auth, setAuth] = useState<boolean | null>(null);
    const [sel, setSel] = useState<any>(null);
    const [delta, setDelta] = useState('');
    const [note, setNote] = useState('');
    const [ledger, setLedger] = useState<any[]>([]);
    const [topups, setTopups] = useState<any[]>([]);
    const [msg, setMsg] = useState('');

    const load = useCallback(async () => {
        const r = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
        if (r.status === 401) return setAuth(false);
        const d = await r.json();
        setAuth(true); setUsers(d.users || []); setTotal(d.totalBalance || 0);
        const t = await fetch('/api/admin/users?view=topups').then((x) => x.json()).catch(() => ({}));
        setTopups(t.topups || []);
    }, [q]);
    useEffect(() => { load(); }, []); // eslint-disable-line

    async function pick(u: any) {
        setSel(u); setMsg('');
        const d = await fetch(`/api/admin/users?view=ledger&userId=${u.id}`).then((x) => x.json());
        setLedger(d.ledger || []);
    }
    async function post(body: any) {
        const r = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        return r.json();
    }
    async function adjust(sign: 1 | -1) {
        const n = Math.trunc(Number(delta));
        if (!n) return setMsg('Isi nominal.');
        const d = await post({ action: 'adjust', userId: sel.id, delta: sign * Math.abs(n), note });
        setMsg(d.success ? `✔ Saldo sekarang ${rp(d.balance)}` : d.message);
        if (d.success) { setDelta(''); setNote(''); load(); pick({ ...sel, balance: d.balance }); }
    }
    async function ban(b: boolean) {
        const d = await post({ action: 'ban', userId: sel.id, banned: b });
        setMsg(d.success ? (b ? '✔ User diblokir' : '✔ Blokir dibuka') : d.message);
        load(); setSel({ ...sel, is_banned: b });
    }

    if (auth === false) return <div className="sne"><div className="auth-page"><div className="auth-card"><h2 style={{ marginTop: 0 }}>Login admin diperlukan</h2><Link className="btn-main" href="/admin" style={{ textDecoration: 'none' }}>Ke Login Admin</Link></div></div></div>;

    return (
        <div className="sne"><div className="sne-wrap" style={{ paddingTop: 20, paddingBottom: 60 }}>
            <div className="sec-head"><div className="ttl"><h2><i className="fa-solid fa-users" /> <span>User &amp; Saldo</span></h2><p>{users.length} user · total saldo beredar {rp(total)}</p></div><Link className="btn-all" href="/admin">← Panel</Link></div>
            <div className="sne-search"><input placeholder="Cari username / email..." value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} /><i className="fa-solid fa-magnifying-glass" /></div>

            <div className="hist" style={{ marginTop: 14 }}>
                {users.map((u) => (
                    <button key={u.id} className="h-item" onClick={() => pick(u)} style={{ textAlign: 'left', color: '#fff', width: '100%', borderColor: sel?.id === u.id ? '#3b72ff' : undefined }}>
                        <div className="ico"><i className="fa-solid fa-user" /></div>
                        <div className="m"><b>{u.username}{u.is_banned ? ' 🚫' : ''}</b><small>{u.email}</small></div>
                        <div className="r"><b>{rp(u.balance)}</b></div>
                    </button>
                ))}
            </div>

            {sel && (
                <div className="panel" style={{ marginTop: 16 }}>
                    <div className="sub-title" style={{ marginTop: 0 }}>{sel.username} — {rp(sel.balance)}</div>
                    <label className="f-lab">Nominal</label><div className="f-in"><input inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value.replace(/\D/g, ''))} /></div>
                    <label className="f-lab">Catatan</label><div className="f-in"><input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} /></div>
                    <div className="pay-seg"><button className="on" onClick={() => adjust(1)}>＋ Tambah Saldo</button><button onClick={() => adjust(-1)}>－ Kurangi Saldo</button></div>
                    <button className="btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => ban(!sel.is_banned)}>{sel.is_banned ? 'Buka Blokir' : 'Blokir User'}</button>
                    {msg && <p style={{ marginTop: 10, fontSize: 13 }}>{msg}</p>}
                    <div className="sub-title">Mutasi Terakhir</div>
                    <div className="hist">{ledger.map((l) => (
                        <div key={l.id} className="h-item"><div className="m"><b>{l.kind}</b><small>{l.note || l.ref}</small></div><div className="r"><b style={{ color: l.amount >= 0 ? '#4ade80' : '#f87171' }}>{l.amount >= 0 ? '+' : ''}{l.amount.toLocaleString('id-ID')}</b></div></div>
                    ))}</div>
                </div>
            )}

            <div className="sub-title">Top Up Terbaru</div>
            <div className="hist">{topups.map((t) => (
                <div key={t.invoice_no} className="h-item"><div className="m"><b>{t.invoice_no}</b><small>{t.users?.username} · {t.payment_name}</small></div><div className="r"><b>{rp(t.amount)}</b><span className={`tag ${t.status === 'PAID' ? 'done' : t.status === 'PENDING' ? 'pending' : 'expired'}`}>{t.status}</span></div></div>
            ))}</div>
        </div></div>
    );
}
