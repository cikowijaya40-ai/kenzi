'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, refreshMe, rp, useCatalog } from '@/lib/client';
import Turnstile from './Turnstile';

/**
 * PORTAL RESELLER (/reseller) — satu halaman seperti portal Thanhub:
 *  belum login  -> Login Reseller (form login tertanam)
 *  bukan reseller -> info + daftar (bayar dari saldo)
 *  reseller aktif -> profil, saldo, statistik, top seller, tab Pembelian / Mutasi / API (+ tabel "Produk Kamu")
 * Saldo di header/menu TIDAK pernah ditulis dari halaman ini (sumbernya selalu /api/auth/me).
 */
type Tab = 'orders' | 'ledger' | 'api';
interface CatItem { sku: string; label: string; apiCode: string | null; price: number; normal: number; inStock: boolean }
interface P {
    ready: boolean; enabled: boolean; price: number; discount: number; apiEnabled: boolean; scope: 'all' | 'selected'; names: string[];
    isReseller: boolean; disabled: boolean; since: string | null; keyPrefix: string | null; keyCreatedAt: string | null; balance: number;
    user: { username: string; email: string }; active: boolean;
    stats?: { keys: number; spent: number; todayKeys: number; todaySpent: number; d30Keys: number; d30Spent: number };
    orders?: { invoice: string; product: string; item: string; quantity: number; total: number; status: 'OK' | 'FAILED' | 'PENDING'; via: string; createdAt: string }[];
    ledger?: { id: number; kind: string; amount: number; balance_after: number; note: string | null; created_at: string }[];
    catalog?: { slug: string; name: string; maintenance: boolean; items: CatItem[] }[];
    topSellers?: { name: string; qty: number; spent: number; me: boolean }[];
}
const dt = (s: string) => new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const KIND: Record<string, string> = { topup: 'Isi saldo', purchase: 'Pembelian', refund: 'Refund', admin_adjust: 'Penyesuaian admin', reseller_fee: 'Biaya reseller' };
/** Kalimat cakupan harga reseller: semua produk, atau hanya produk tertentu. */
const scopeText = (p: { scope: 'all' | 'selected'; names: string[]; discount: number }) =>
    p.scope === 'all' ? `diskon sekitar ${p.discount}% di seluruh toko`
        : p.names.length ? `harga khusus untuk ${p.names.join(', ')} (produk lain tetap harga normal)` : 'harga khusus untuk produk tertentu (produk lain tetap harga normal)';
const grey: React.CSSProperties = { background: '#fff', color: 'var(--text)', border: '1px solid var(--line)', boxShadow: 'none' };

function usePortal() {
    const [p, setP] = useState<P | null | undefined>(undefined);   // undefined = memuat, null = belum login
    const load = useCallback(async () => {
        const r: any = await api('/api/reseller/portal');
        if (r.status === 401) return setP(null);
        if (r.success) setP(r as P);
    }, []);
    useEffect(() => { load(); }, [load]);
    return { p, load };
}

/* ───────── login khusus reseller (tertanam) ───────── */
function LoginHero({ onDone }: { onDone: () => void }) {
    const { data } = useCatalog();
    const wa = data?.settings?.whatsapp_cs || '';
    const [f, setF] = useState({ identifier: '', password: '' });
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [ts, setTs] = useState('');
    const [tsReset, setTsReset] = useState(0);
    async function submit(e: React.FormEvent) {
        e.preventDefault(); setBusy(true); setErr('');
        const r: any = await api('/api/auth/login', { method: 'POST', json: { ...f, turnstileToken: ts } });
        setBusy(false);
        if (r.success) { refreshMe(); onDone(); } else { setErr(r.message || 'Login gagal.'); setTsReset((n) => n + 1); }
    }
    const waLink = wa ? `${wa}${wa.includes('?') ? '&' : '?'}text=${encodeURIComponent('Halo admin, saya mau daftar jadi reseller.')}` : '';
    return (
        <div className="kx-wrap kx-dash">
            <div className="kx-profile">
                <div className="av"><i className="fa-solid fa-crown" /></div>
                <div style={{ minWidth: 0 }}><h1>Login Reseller</h1><small>Masuk ke portal untuk lihat harga reseller, saldo, dan API key kamu.</small></div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0 0', fontSize: 12.5, fontWeight: 700 }}>
                {[['fa-tags', 'Harga Reseller'], ['fa-wallet', 'Saldo & QRIS'], ['fa-plug', 'API Key']].map(([ic, t]) => <span key={t} className="panel" style={{ padding: '6px 12px', borderRadius: 999, margin: 0 }}><i className={`fa-solid ${ic}`} /> {t}</span>)}
            </div>
            <form className="panel" style={{ marginTop: 14 }} onSubmit={submit}>
                <label className="f-lab" htmlFor="rid">Username / Email reseller</label>
                <div className="f-in"><input id="rid" value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} autoComplete="username" required /></div>
                <label className="f-lab" htmlFor="rpw">Password</label>
                <div className="f-in">
                    <input id="rpw" type={show ? 'text' : 'password'} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" required />
                    <button type="button" className="eye" onClick={() => setShow(!show)} aria-label="Tampilkan password"><i className={show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'} /></button>
                </div>
                <Turnstile onToken={setTs} resetKey={tsReset} />
                {err && <div className="alert on">{err}</div>}
                <button className="btn-pay" disabled={busy}>{busy ? 'Memproses...' : 'Login Reseller'}</button>
                <p className="hint" style={{ marginTop: 10 }}>Akun reseller dibuat oleh admin. Belum punya? {waLink ? <a href={waLink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Hubungi admin via WhatsApp</a> : 'Hubungi admin.'}</p>
            </form>
            <Link href="/docs/api" className="kx-btn-full" style={grey}><i className="fa-solid fa-book" /> Dokumentasi API</Link>
        </div>
    );
}

/* ───────── bukan reseller ───────── */
function NotReseller({ p, reload }: { p: P; reload: () => void }) {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    async function join() {
        if (!confirm(`Bayar biaya bergabung ${rp(p.price)} dari saldo kamu?`)) return;
        setBusy(true); setMsg('');
        const r: any = await api('/api/reseller/join', { method: 'POST' });
        setBusy(false);
        if (r.success) { refreshMe(); reload(); } else setMsg(r.message || 'Gagal mendaftar.');
    }
    return (
        <div className="kx-wrap kx-dash">
            <div className="kx-profile">
                <div className="av"><i className="fa-solid fa-handshake" /></div>
                <div style={{ minWidth: 0 }}><h1>{p.isReseller && p.disabled ? 'Reseller Dinonaktifkan' : 'Jadi Reseller'}</h1><small>Halo, {p.user.username}</small></div>
            </div>
            {!p.ready && <div className="alert on">Fitur reseller belum aktif di server (database belum diperbarui). Hubungi admin.</div>}
            {p.ready && p.isReseller && p.disabled && <div className="alert on">Akun reseller kamu sedang dinonaktifkan admin. Hubungi admin untuk mengaktifkan lagi.</div>}
            {p.ready && !p.isReseller && (
                <div className="panel" style={{ marginTop: 14 }}>
                    <div className="sub-title" style={{ marginTop: 0 }}>Akun ini belum reseller</div>
                    <p style={{ fontSize: 14, margin: '0 0 10px' }}>Reseller mendapat {scopeText(p)}, pembelian memotong saldo otomatis, dan bisa memakai API.</p>
                    {!p.enabled ? <div className="alert on">Pendaftaran mandiri sedang ditutup. Hubungi admin untuk dijadikan reseller.</div> : (
                        <>
                            <div className="det-row"><span>Biaya bergabung (sekali)</span><b>{rp(p.price)}</b></div>
                            <div className="det-row"><span>Saldo kamu</span><b>{rp(p.balance)}</b></div>
                            {p.balance < p.price && <p style={{ fontSize: 13, color: '#b91c1c', margin: '8px 0' }}>Saldo belum cukup. <Link href="/dashboard#topup" style={{ textDecoration: 'underline' }}>Isi saldo dulu</Link>.</p>}
                            {msg && <div className="alert on">{msg}</div>}
                            <button className="btn-pay" onClick={join} disabled={busy || p.balance < p.price}>{busy ? 'Memproses...' : `Daftar Reseller — ${rp(p.price)}`}</button>
                        </>
                    )}
                </div>
            )}
            <Link href="/docs/api" className="kx-btn-full" style={grey}><i className="fa-solid fa-book" /> Dokumentasi API</Link>
        </div>
    );
}

/* ───────── dashboard reseller ───────── */
function Dashboard({ p, reload, initialTab }: { p: P; reload: () => void; initialTab: Tab }) {
    const [tab, setTab] = useState<Tab>(initialTab);
    const [fresh, setFresh] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [copied, setCopied] = useState('');
    const [q, setQ] = useState('');
    const base = typeof window !== 'undefined' ? `${window.location.origin}/api/v1` : '/api/v1';
    const s = p.stats!;

    const copy = async (text: string, id: string) => {
        try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1500); } catch { setErr('Gagal menyalin, salin manual.'); }
    };
    async function act(action: 'create' | 'revoke') {
        if (action === 'create' && p.keyPrefix && !confirm('Membuat key baru akan langsung mematikan key yang lama. Lanjut?')) return;
        if (action === 'revoke' && !confirm('Cabut API key? Semua integrasi yang memakai key ini akan berhenti bekerja.')) return;
        setBusy(true); setErr('');
        const r: any = await api('/api/reseller/key', { method: 'POST', json: { action } });
        setBusy(false);
        if (!r.success) return setErr(r.message || 'Gagal.');
        setFresh(action === 'create' ? r.key : null);
        reload();
    }
    const rows = useMemo(() => {
        const t = q.trim().toLowerCase();
        const out: { product: string; maint: boolean; it: CatItem }[] = [];
        for (const pr of p.catalog || []) for (const it of pr.items) if (!t || `${pr.name} ${it.label} ${it.apiCode || ''}`.toLowerCase().includes(t)) out.push({ product: pr.name, maint: pr.maintenance, it });
        return out;
    }, [p.catalog, q]);
    const curl = (code: string) => `curl -X POST ${base}/orders \\\n  -H "Authorization: Bearer rk_live_KEY_KAMU" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: $(uuidgen)" \\\n  -d '{"sku":"${code}","quantity":1}'`;
    const K = (n: number) => (n >= 1000 ? (Math.round(n / 100) / 10).toString().replace('.', ',') + 'rb' : String(n));

    return (
        <div className="kx-wrap kx-dash">
            <div className="kx-profile">
                <div className="av">{p.user.username.slice(0, 1).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                    <h1>{p.user.username} <span style={{ fontSize: 11, background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: 999, verticalAlign: 'middle', fontWeight: 800 }}><i className="fa-solid fa-star" /> RESELLER</span></h1>
                    <small>{p.user.email}</small>
                </div>
            </div>

            <div className="panel" style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                <i className="fa-solid fa-crown" style={{ fontSize: 24, color: '#d97706' }} />
                <div><b style={{ color: '#16a34a' }}><i className="fa-solid fa-circle-check" /> Reseller Aktif</b><div style={{ fontSize: 13 }}>Kamu mendapat {scopeText(p)} · pembelian memotong saldo otomatis.</div></div>
            </div>

            <div className="panel" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div><small style={{ fontWeight: 700 }}><i className="fa-solid fa-wallet" /> Saldo kamu</small><div style={{ fontSize: 26, fontWeight: 800 }}>{rp(p.balance)}</div></div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Link href="/dashboard#topup" className="btn-pay" style={{ textDecoration: 'none', margin: 0, padding: '0 16px' }}><i className="fa-solid fa-plus" /> Isi Saldo</Link>
                    <Link href="/" className="btn-pay" style={{ textDecoration: 'none', margin: 0, padding: '0 16px', ...grey }}><i className="fa-solid fa-bag-shopping" /> Belanja</Link>
                </div>
            </div>

            <div className="kx-stats">
                <div><b className="s">{K(s.keys)}</b><span>Total Key</span></div>
                <div><b className="g">{rp(s.spent).replace('Rp ', '')}</b><span>Total Belanja</span></div>
                <div><b className="a">{s.todayKeys}</b><span>Key Hari Ini</span></div>
                <div><b>{K(s.d30Keys)}</b><span>Key 30 Hari</span></div>
            </div>

            {!!p.topSellers?.length && (
                <details className="panel" style={{ marginTop: 12 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 800 }}><i className="fa-solid fa-trophy" /> Top Sellers</summary>
                    {p.topSellers.map((t, i) => (
                        <div key={i} className="det-row"><span><b>{i + 1}.</b> {t.name}{t.me && <small style={{ marginLeft: 6, color: '#2563eb', fontWeight: 800 }}>kamu</small>}</span><b>{t.qty.toLocaleString('id-ID')} key · {rp(t.spent)}</b></div>
                    ))}
                </details>
            )}

            {fresh && (
                <div className="panel" style={{ marginTop: 12, background: '#ecfdf5', borderColor: '#a7f3d0' }}>
                    <b style={{ color: '#047857', fontSize: 13 }}>API key baru kamu. Simpan sekarang, hanya tampil sekali.</b>
                    <code style={{ display: 'block', margin: '8px 0', wordBreak: 'break-all', fontSize: 12.5, userSelect: 'all' }}>{fresh}</code>
                    <button className="btn-pay" onClick={() => copy(fresh, 'newkey')}>{copied === 'newkey' ? '✔ Tersalin' : 'Salin key'}</button>
                    <p className="hint" style={{ marginTop: 8 }}>Simpan di server webmu, jangan taruh di kode frontend.</p>
                </div>
            )}

            <div className="kx-tabs">
                {([['orders', 'Pembelian', 'fa-bag-shopping'], ['ledger', 'Mutasi', 'fa-wallet'], ['api', 'API', 'fa-plug']] as const).map(([k, l, ic]) => (
                    <button key={k} className={`kx-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}><i className={`fa-solid ${ic}`} /> {l}</button>
                ))}
            </div>

            {tab === 'orders' && (
                <div className="hist" style={{ marginTop: 12 }}>
                    {!p.orders?.length && <div className="kx-empty">Belum ada pembelian. <Link href="/" style={{ textDecoration: 'underline' }}>Mulai belanja</Link></div>}
                    {p.orders?.map((o) => (
                        <Link key={o.invoice} href={`/order/${o.invoice}`} className="h-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                            <div className="m"><b>{o.product} · {o.item}{o.quantity > 1 ? ` ×${o.quantity}` : ''}</b><small>{dt(o.createdAt)} · {o.via} · {o.invoice}</small></div>
                            <div className="r"><b>{rp(o.total)}</b><small style={{ color: o.status === 'OK' ? '#16a34a' : o.status === 'FAILED' ? '#dc2626' : '#d97706', fontWeight: 800 }}>{o.status === 'OK' ? 'Berhasil' : o.status === 'FAILED' ? 'Gagal' : 'Diproses'}</small></div>
                        </Link>
                    ))}
                </div>
            )}

            {tab === 'ledger' && (
                <div className="hist" style={{ marginTop: 12 }}>
                    {!p.ledger?.length && <div className="kx-empty">Belum ada mutasi saldo.</div>}
                    {p.ledger?.map((l) => (
                        <div key={l.id} className="h-item">
                            <div className="m"><b>{KIND[l.kind] || l.kind}</b><small>{dt(l.created_at)}{l.note ? ' · ' + l.note : ''}</small></div>
                            <div className="r"><b style={{ color: l.amount < 0 ? '#dc2626' : '#16a34a' }}>{l.amount > 0 ? '+' : ''}{rp(l.amount)}</b><small>Saldo {rp(l.balance_after)}</small></div>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'api' && (
                <>
                    <div className="panel" style={{ marginTop: 12 }}>
                        <div className="sub-title" style={{ marginTop: 0 }}>API Key</div>
                        {!p.apiEnabled && <div className="alert on">API reseller sedang dimatikan sementara oleh admin.</div>}
                        <div className="det-row"><span>Key aktif</span><b style={{ fontFamily: 'monospace' }}>{p.keyPrefix || 'Belum ada'}</b></div>
                        {p.keyCreatedAt && <div className="det-row"><span>Dibuat</span><b>{dt(p.keyCreatedAt)}</b></div>}
                        {err && <div className="alert on">{err}</div>}
                        <button className="btn-pay" style={{ marginTop: 12 }} onClick={() => act('create')} disabled={busy}>{busy ? '...' : p.keyPrefix ? 'Ganti API key' : 'Buat API key'}</button>
                        {p.keyPrefix && <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => act('revoke')} disabled={busy}>Cabut key</button>}
                    </div>
                    <div className="panel" style={{ marginTop: 12 }}>
                        <div className="sub-title" style={{ marginTop: 0 }}>Integrasi</div>
                        <div className="det-row"><span>Base URL</span><b style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{base}</b></div>
                        <div className="det-row"><span>Autentikasi</span><b style={{ fontFamily: 'monospace', fontSize: 12.5 }}>Bearer rk_live_…</b></div>
                        <div className="det-row"><span>Batas</span><b>120 request / menit</b></div>
                        <Link href="/docs/api" className="kx-btn-full"><i className="fa-solid fa-book" /> Dokumentasi API</Link>
                    </div>
                    <div className="panel" style={{ marginTop: 12 }}>
                        <div className="sub-title" style={{ marginTop: 0 }}>Produk Kamu <small style={{ fontWeight: 600 }}>({rows.length} varian)</small></div>
                        <p className="hint">Pakai <b>kode API</b> di <code>POST /api/v1/orders</code>. Ketuk kode untuk menyalin. Varian tanpa kode tidak masuk API, tapi tetap bisa dibeli di web. Harga dicoret = harga normal, hanya produk yang masuk program yang lebih murah.</p>
                        <div className="f-in"><input placeholder="Cari produk atau kode..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
                        <div style={{ overflowX: 'auto', marginTop: 8 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}><th style={{ padding: '6px 4px' }}>Kode</th><th>Produk / Varian</th><th>Harga</th><th>Stok</th><th /></tr></thead>
                                <tbody>
                                    {rows.map(({ product, maint, it }) => (
                                        <tr key={product + it.sku} style={{ borderBottom: '1px solid var(--line)' }}>
                                            <td style={{ padding: '6px 4px' }}>{it.apiCode ? <button type="button" className="btn-ghost" style={{ padding: '2px 8px', fontFamily: 'monospace' }} onClick={() => copy(it.apiCode!, it.sku + product)}>{copied === it.sku + product ? '✔' : it.apiCode}</button> : <span style={{ opacity: 0.5 }}>-</span>}</td>
                                            <td><b>{product}</b>{maint && <small style={{ color: '#d97706', marginLeft: 6 }}>MAINTENANCE</small>}<div style={{ opacity: 0.75 }}>{it.label}</div></td>
                                            <td style={{ whiteSpace: 'nowrap' }}><b>{rp(it.price)}</b>{it.normal > it.price && <s style={{ display: 'block', opacity: 0.55 }}>{rp(it.normal)}</s>}</td>
                                            <td><span style={{ color: it.inStock ? '#16a34a' : '#dc2626', fontWeight: 800 }}>{it.inStock ? 'Ada' : 'Habis'}</span></td>
                                            <td style={{ textAlign: 'right' }}>{it.apiCode && <button type="button" className="btn-ghost" style={{ padding: '2px 8px' }} onClick={() => copy(curl(it.apiCode!), 'c' + it.sku + product)}>{copied === 'c' + it.sku + product ? '✔' : 'curl'}</button>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {!rows.length && <div className="kx-empty">Tidak ada yang cocok.</div>}
                    </div>
                </>
            )}
        </div>
    );
}

function Portal({ initialTab }: { initialTab: Tab }) {
    const { p, load } = usePortal();
    if (p === undefined) return <div className="kx-wrap"><div className="kx-empty">Memuat...</div></div>;
    if (p === null) return <LoginHero onDone={load} />;
    if (!p.active) return <NotReseller p={p} reload={load} />;
    return <Dashboard p={p} reload={load} initialTab={initialTab} />;
}

export function ResellerLanding() { return <Portal initialTab="orders" />; }
export function ResellerApiDash() { return <Portal initialTab="api" />; }
