'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import Turnstile from '@/components/Turnstile';

/** Ganti username / password / email admin. Password disimpan sebagai hash; wajib isi password saat ini. */
export default function AdminAccountCard() {
    const [me, setMe] = useState<{ username: string; email: string | null } | null>(null);
    const [f, setF] = useState({ currentPassword: '', newUsername: '', newPassword: '', email: '' });
    const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        fetch('/api/admin/account').then((r) => r.json()).then((d) => d.success && (setMe(d), setF((s) => ({ ...s, email: d.email || '' })))).catch(() => { });
    }, []);

    async function save() {
        setBusy(true); setMsg(null);
        const body: any = { currentPassword: f.currentPassword, email: f.email };
        if (f.newUsername.trim()) body.newUsername = f.newUsername.trim();
        if (f.newPassword) body.newPassword = f.newPassword;
        const r = await fetch('/api/admin/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json().catch(() => ({}));
        setBusy(false);
        setMsg({ ok: !!d.success, t: d.message || 'Gagal' });
        if (d.success) { setMe({ username: d.username, email: f.email || null }); setF((s) => ({ ...s, currentPassword: '', newPassword: '', newUsername: '' })); }
    }
    const inp = 'w-full bg-[#060a1c] border border-blue-500/40 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500';

    return (
        <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-500/20 space-y-3">
            <h3 className="text-xs font-bold text-blue-300 uppercase tracking-wider">🔐 Keamanan: Akun Login Admin {me && <span className="text-gray-400 normal-case">(sekarang: {me.username})</span>}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                <div><label className="block text-xs text-gray-400 mb-1">Username baru (opsional)</label><input className={inp} value={f.newUsername} onChange={(e) => setF({ ...f, newUsername: e.target.value })} autoComplete="off" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Password baru (opsional)</label><input type="password" className={inp} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} autoComplete="new-password" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Email pemulihan</label><input type="email" className={inp} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="untuk tautan reset password" /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Password saat ini (wajib)</label><input type="password" className={inp} value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} autoComplete="current-password" /></div>
            </div>
            <button type="button" onClick={save} disabled={busy || !f.currentPassword} className="coda-btn px-5 py-2 text-xs font-bold">{busy ? 'Menyimpan...' : 'Simpan Akun Admin'}</button>
            {msg && <p className={`text-xs ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.t}</p>}
            <p className="text-[11px] text-gray-500">Password min. 8 karakter (huruf + angka). Mengganti password otomatis mengeluarkan semua sesi admin lain.</p>
        </div>
    );
}

function Inner() {
    const token = useSearchParams().get('token') || '';
    const mode: 'forgot' | 'reset' = token ? 'reset' : 'forgot';
    const [f, setF] = useState({ username: '', recoveryKey: '', newUsername: '', newPassword: '' });
    const [useKey, setUseKey] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [ts, setTs] = useState('');
    const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true); setMsg(null);
        const isForgot = mode === 'forgot' && !useKey;
        const body = isForgot ? { username: f.username, turnstileToken: ts } : { ...(token ? { token } : { recoveryKey: f.recoveryKey }), newPassword: f.newPassword, newUsername: f.newUsername };
        const r = await fetch(isForgot ? '/api/admin/forgot' : '/api/admin/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json().catch(() => ({}));
        setBusy(false);
        setMsg({ ok: !!d.success, t: d.message || 'Gagal' });
    }

    const showReset = mode === 'reset' || useKey;
    return (
        <div className="auth-page">
            <form className="auth-card" onSubmit={submit}>
                <h2 style={{ marginTop: 0 }}>{showReset ? 'Atur Ulang Akun Admin' : 'Lupa Akses Admin'}</h2>
                <p className="sub">{showReset ? 'Tentukan password baru (dan username baru bila perlu).' : 'Masukkan username admin. Tautan reset dikirim ke email admin yang terdaftar.'}</p>

                {!showReset && (<><label className="f-lab">Username Admin</label><div className="f-in"><input value={f.username} onChange={(e) => set('username', e.target.value)} required /></div></>)}
                {showReset && !token && (<><label className="f-lab">Kunci Pemulihan (ADMIN_RECOVERY_KEY)</label><div className="f-in"><input type="password" value={f.recoveryKey} onChange={(e) => set('recoveryKey', e.target.value)} required /></div></>)}
                {showReset && (<>
                    <label className="f-lab">Username Baru (opsional)</label><div className="f-in"><input value={f.newUsername} onChange={(e) => set('newUsername', e.target.value)} /></div>
                    <label className="f-lab">Password Baru</label><div className="f-in"><input type="password" value={f.newPassword} onChange={(e) => set('newPassword', e.target.value)} autoComplete="new-password" required /></div>
                </>)}

                {!showReset && <Turnstile onToken={setTs} />}
                {msg && <div className="auth-err" style={msg.ok ? { background: 'rgba(34,197,94,.1)', borderColor: '#166534', color: '#86efac' } : undefined}>{msg.t}</div>}
                <button className="btn-main" disabled={busy}>{busy ? 'Memproses...' : showReset ? 'Simpan' : 'Kirim Tautan Reset'}</button>
                <p className="auth-alt">
                    {mode === 'forgot' && <button type="button" onClick={() => setUseKey(!useKey)}>{useKey ? 'Kembali ke reset via email' : 'Pakai Kunci Pemulihan'}</button>}
                    {' '}<Link href="/admin">← Ke login admin</Link>
                </p>
            </form>
        </div>
    );
}

export function AdminRecovery() {
    return <Suspense fallback={null}><Inner /></Suspense>;
}
