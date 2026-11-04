'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api, refreshMe } from '@/lib/client';
import Turnstile from '@/components/Turnstile';

function Form({ mode }: { mode: 'login' | 'register' }) {
    const router = useRouter();
    const sp = useSearchParams();
    const rawNext = sp.get('next') || '/dashboard';
    const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'; // cegah open redirect
    const [f, setF] = useState({ identifier: '', username: '', email: '', password: '', whatsapp: '' });
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [ts, setTs] = useState('');
    const [tsReset, setTsReset] = useState(0);
    const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
    const isLogin = mode === 'login';

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true); setErr('');
        const r: any = await api(isLogin ? '/api/auth/login' : '/api/auth/register', { method: 'POST', json: { ...f, turnstileToken: ts } });
        setBusy(false);
        if (r.success) { refreshMe(); router.push(next); router.refresh(); }
        else { setErr(r.message || 'Gagal.'); setTsReset((n) => n + 1); }
    }

    return (
        <div className="auth-page">
            <form className="auth-card" onSubmit={submit}>
                <div className="auth-top">
                    <div className="seg">
                        <Link href={`/login?next=${encodeURIComponent(next)}`} className={isLogin ? 'on' : ''}>Login</Link>
                        <Link href={`/register?next=${encodeURIComponent(next)}`} className={!isLogin ? 'on' : ''}>Daftar</Link>
                    </div>
                    <Link href="/" className="x-btn" aria-label="Tutup"><i className="fa-solid fa-xmark" /></Link>
                </div>
                <h2>{isLogin ? 'Selamat Datang' : 'Buat Akun'}</h2>
                <p className="sub">{isLogin ? 'Masuk untuk isi saldo dan membeli produk.' : 'Daftar gratis, lalu isi saldo untuk mulai membeli.'}</p>

                {isLogin ? (
                    <>
                        <label className="f-lab" htmlFor="idf">Username / Email</label>
                        <div className="f-in"><input id="idf" value={f.identifier} onChange={(e) => set('identifier', e.target.value)} autoComplete="username" required /></div>
                    </>
                ) : (
                    <>
                        <label className="f-lab" htmlFor="un">Username</label>
                        <div className="f-in"><input id="un" value={f.username} onChange={(e) => set('username', e.target.value)} maxLength={20} autoComplete="username" required /></div>
                        <label className="f-lab" htmlFor="em">Email</label>
                        <div className="f-in"><input id="em" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" required /></div>
                        <label className="f-lab" htmlFor="wa2">WhatsApp (Opsional)</label>
                        <div className="f-in"><input id="wa2" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} inputMode="tel" /></div>
                    </>
                )}
                <label className="f-lab" htmlFor="pw">Password</label>
                <div className="f-in">
                    <input id="pw" type={show ? 'text' : 'password'} value={f.password} onChange={(e) => set('password', e.target.value)} autoComplete={isLogin ? 'current-password' : 'new-password'} required />
                    <button type="button" className="eye" onClick={() => setShow(!show)} aria-label="Tampilkan password"><i className={show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'} /></button>
                </div>
                {!isLogin && <p className="sub" style={{ marginTop: 8, fontSize: 12 }}>Minimal 8 karakter, kombinasi huruf dan angka.</p>}

                <Turnstile onToken={setTs} resetKey={tsReset} />
                {err && <div className="auth-err">{err}</div>}
                <button className="btn-main" disabled={busy}>{busy ? 'Memproses...' : isLogin ? 'Login' : 'Daftar'}</button>
                <p className="auth-alt">
                    {isLogin ? <>Belum punya akun? <Link href="/register">Daftar</Link></> : <>Sudah punya akun? <Link href="/login">Login</Link></>}
                </p>
            </form>
        </div>
    );
}

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
    return <Suspense fallback={null}><Form mode={mode} /></Suspense>;
}
