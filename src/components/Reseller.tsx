'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, refreshMe, rp, setMeBalance } from '@/lib/client';

interface State {
    enabled: boolean; price: number; discount: number; apiEnabled: boolean;
    isReseller: boolean; disabled: boolean; since: string | null; keyPrefix: string | null; keyCreatedAt: string | null; balance: number;
}
const dt = (s: string) => new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** undefined = memuat, null = belum login */
function useState_() {
    const [st, setSt] = useState<State | null | undefined>(undefined);
    const load = useCallback(async () => {
        const r: any = await api('/api/reseller/me');
        if (r.status === 401) return setSt(null);
        if (r.success) { setSt(r as State); setMeBalance(r.balance); }
    }, []);
    useEffect(() => { load(); }, [load]);
    return { st, load };
}

/* ───────── /reseller ───────── */
export function ResellerLanding() {
    const { st, load } = useState_();
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

    async function join() {
        if (!st) return;
        if (!confirm(`Bayar biaya bergabung ${rp(st.price)} dari saldo kamu?`)) return;
        setBusy(true); setMsg(null);
        const r: any = await api('/api/reseller/join', { method: 'POST' });
        setBusy(false);
        if (r.success) { setMsg({ ok: true, t: 'Selamat! Kamu sekarang reseller. Buat API key kamu di halaman berikutnya.' }); refreshMe(); load(); }
        else setMsg({ ok: false, t: r.message || 'Gagal mendaftar.' });
    }

    const perks: [string, string, string][] = [
        ['fa-tags', 'Harga Reseller', st ? `Diskon sekitar ${st.discount}% dari harga biasa untuk semua produk.` : 'Harga lebih murah untuk semua produk.'],
        ['fa-bolt', 'Key Otomatis 24 Jam', 'Key langsung dikirim di respons API, tanpa menunggu admin.'],
        ['fa-code', 'Reseller API', 'Sambungkan ke web atau bot kamu sendiri lewat API sederhana.'],
        ['fa-wallet', 'Pakai Saldo', 'Isi saldo sekali, beli kapan saja. Order aman dari double-spend.'],
    ];

    return (
        <div className="kx-wrap kx-dash">
            <div className="kx-profile">
                <div className="av"><i className="fa-solid fa-handshake" /></div>
                <div style={{ minWidth: 0 }}><h1>Jadi Reseller Resmi</h1><small>Beli lebih murah, jual lagi dengan margin kamu sendiri.</small></div>
            </div>

            <div className="panel" style={{ marginTop: 14 }}>
                <div className="sub-title" style={{ marginTop: 0 }}>Keuntungan</div>
                {perks.map(([ic, t, d]) => (
                    <div key={t} className="det-row" style={{ alignItems: 'flex-start' }}>
                        <span style={{ width: 28 }}><i className={`fa-solid ${ic}`} /></span>
                        <span style={{ flex: 1, textAlign: 'left' }}><b style={{ display: 'block', textAlign: 'left' }}>{t}</b>{d}</span>
                    </div>
                ))}
            </div>

            {st === undefined && <div className="kx-empty">Memuat...</div>}

            {st === null && (
                <div className="panel" style={{ marginTop: 14, textAlign: 'center' }}>
                    <p style={{ margin: '0 0 12px' }}>Masuk dulu untuk mendaftar sebagai reseller.</p>
                    <Link href="/login?next=/reseller" className="kx-btn-full">Masuk / Daftar</Link>
                </div>
            )}

            {st && !st.enabled && !st.isReseller && <div className="alert on">Pendaftaran reseller sedang ditutup. Coba lagi nanti.</div>}

            {st && st.isReseller && (
                <div className="panel" style={{ marginTop: 14 }}>
                    <div className="sub-title" style={{ marginTop: 0 }}>{st.disabled ? 'Reseller dinonaktifkan' : 'Kamu sudah reseller'}</div>
                    <p style={{ margin: '0 0 10px', fontSize: 14 }}>
                        {st.disabled ? 'Akun reseller kamu sedang dinonaktifkan admin. Hubungi admin untuk mengaktifkan lagi.' : `Aktif sejak ${st.since ? dt(st.since) : '-'}.`}
                    </p>
                    {!st.disabled && <Link href="/reseller/api" className="kx-btn-full" style={{ marginTop: 0 }}><i className="fa-solid fa-key" /> Buka API Key</Link>}
                </div>
            )}

            {st && !st.isReseller && st.enabled && (
                <div className="panel" style={{ marginTop: 14 }}>
                    <div className="sub-title" style={{ marginTop: 0 }}>Daftar Sekarang</div>
                    <div className="det-row"><span>Biaya bergabung (sekali)</span><b>{rp(st.price)}</b></div>
                    <div className="det-row"><span>Saldo kamu</span><b>{rp(st.balance)}</b></div>
                    {st.balance < st.price && <p style={{ fontSize: 13, color: '#b91c1c', margin: '8px 0' }}>Saldo belum cukup. <Link href="/dashboard#topup" style={{ textDecoration: 'underline' }}>Isi saldo dulu</Link>.</p>}
                    <button className="btn-pay" onClick={join} disabled={busy || st.balance < st.price}>{busy ? 'Memproses...' : `Daftar Reseller — ${rp(st.price)}`}</button>
                </div>
            )}

            {msg && <div className={`alert on`} style={msg.ok ? { background: '#ecfdf5', borderColor: '#a7f3d0', color: '#047857' } : undefined}>{msg.t}</div>}
            <Link href="/docs/api" className="kx-btn-full" style={{ background: '#fff', color: 'var(--text)', border: '1px solid var(--line)', boxShadow: 'none' }}><i className="fa-solid fa-book" /> Dokumentasi API</Link>
        </div>
    );
}

/* ───────── /reseller/api ───────── */
export function ResellerApiDash() {
    const { st, load } = useState_();
    const [busy, setBusy] = useState(false);
    const [fresh, setFresh] = useState<string | null>(null);   // key utuh: hanya ada di memori halaman ini, sekali tampil
    const [copied, setCopied] = useState(false);
    const [err, setErr] = useState('');
    const base = typeof window !== 'undefined' ? `${window.location.origin}/api/v1` : '/api/v1';

    async function act(action: 'create' | 'revoke') {
        if (action === 'create' && st?.keyPrefix && !confirm('Membuat key baru akan langsung mematikan key yang lama. Lanjut?')) return;
        if (action === 'revoke' && !confirm('Cabut API key? Semua integrasi yang memakai key ini akan berhenti bekerja.')) return;
        setBusy(true); setErr(''); setCopied(false);
        const r: any = await api('/api/reseller/key', { method: 'POST', json: { action } });
        setBusy(false);
        if (!r.success) return setErr(r.message || 'Gagal.');
        setFresh(action === 'create' ? r.key : null);
        load();
    }
    async function copy() {
        if (!fresh) return;
        try { await navigator.clipboard.writeText(fresh); setCopied(true); } catch { setErr('Gagal menyalin. Salin manual dari kotak di atas.'); }
    }

    if (st === undefined) return <div className="kx-wrap"><div className="kx-empty">Memuat...</div></div>;
    if (st === null) return <div className="kx-wrap"><div className="panel" style={{ marginTop: 16, textAlign: 'center' }}><p>Masuk dulu untuk membuka dashboard reseller.</p><Link href="/login?next=/reseller/api" className="kx-btn-full">Masuk</Link></div></div>;
    if (!st.isReseller) return <div className="kx-wrap"><div className="panel" style={{ marginTop: 16, textAlign: 'center' }}><p>Kamu belum menjadi reseller.</p><Link href="/reseller" className="kx-btn-full">Daftar Reseller</Link></div></div>;

    return (
        <div className="kx-wrap kx-dash">
            <div className="kx-profile">
                <div className="av"><i className="fa-solid fa-key" /></div>
                <div style={{ minWidth: 0 }}><h1>Reseller API</h1><small>Saldo {rp(st.balance)}</small></div>
            </div>

            {st.disabled && <div className="alert on">Akun reseller kamu sedang dinonaktifkan admin, jadi API key tidak bisa dipakai.</div>}
            {!st.apiEnabled && <div className="alert on">API reseller sedang dimatikan sementara oleh admin.</div>}

            <div className="panel" style={{ marginTop: 14 }}>
                <div className="sub-title" style={{ marginTop: 0 }}>API Key</div>
                {fresh && (
                    <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                        <b style={{ color: '#047857', fontSize: 13 }}>Simpan sekarang. Key ini hanya tampil sekali.</b>
                        <code style={{ display: 'block', marginTop: 8, wordBreak: 'break-all', fontSize: 12.5, userSelect: 'all' }}>{fresh}</code>
                        <button className="btn-pay" style={{ marginTop: 10 }} onClick={copy}>{copied ? '✔ Tersalin' : 'Salin key'}</button>
                    </div>
                )}
                <div className="det-row"><span>Key aktif</span><b style={{ fontFamily: 'monospace' }}>{st.keyPrefix || 'Belum ada'}</b></div>
                {st.keyCreatedAt && <div className="det-row"><span>Dibuat</span><b>{dt(st.keyCreatedAt)}</b></div>}
                {err && <div className="alert on">{err}</div>}
                <button className="btn-pay" style={{ marginTop: 12 }} onClick={() => act('create')} disabled={busy || st.disabled}>{busy ? '...' : st.keyPrefix ? 'Ganti API key' : 'Buat API key'}</button>
                {st.keyPrefix && <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => act('revoke')} disabled={busy}>Cabut key</button>}
            </div>

            <div className="panel" style={{ marginTop: 14 }}>
                <div className="sub-title" style={{ marginTop: 0 }}>Info Integrasi</div>
                <div className="det-row"><span>Base URL</span><b style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{base}</b></div>
                <div className="det-row"><span>Autentikasi</span><b style={{ fontFamily: 'monospace', fontSize: 12.5 }}>Bearer rk_live_…</b></div>
                <div className="det-row"><span>Batas</span><b>120 request / menit</b></div>
                <Link href="/docs/api" className="kx-btn-full"><i className="fa-solid fa-book" /> Buka Dokumentasi API</Link>
            </div>
        </div>
    );
}
