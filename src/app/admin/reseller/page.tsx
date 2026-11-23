'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const rp = (n: number) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-');

async function post(body: any) {
    const r = await fetch('/api/admin/reseller', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json().catch(() => ({ success: false, message: 'Respons tidak valid.' }));
}
const inp: React.CSSProperties = { width: '100%', height: 38, borderRadius: 8, padding: '0 10px' };
const KIND: Record<string, string> = { topup: 'Isi saldo', purchase: 'Pembelian', refund: 'Refund', admin_adjust: 'Admin', reseller_fee: 'Biaya reseller' };

type Mode = 'saldo' | 'edit' | 'pw' | 'ledger' | 'hapus';

export default function AdminReseller() {
    const [auth, setAuth] = useState<boolean | null>(null);
    const [cfg, setCfg] = useState({ enabled: true, apiEnabled: true, price: '50000', discount: '20' });
    const [resellers, setResellers] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [products, setProducts] = useState<{ slug: string; name: string }[]>([]);
    const [scope, setScope] = useState<'all' | 'selected'>('all');
    const [slugs, setSlugs] = useState<string[]>([]);
    const [qProd, setQProd] = useState('');
    const [excluded, setExcluded] = useState<any[]>([]);
    const [edit, setEdit] = useState<Record<string, string>>({});
    const [q, setQ] = useState('');
    const [qItem, setQItem] = useState('');
    const [msg, setMsg] = useState('');
    // tambah reseller
    const [addMode, setAddMode] = useState<'new' | 'existing'>('new');
    const [form, setForm] = useState({ username: '', email: '', whatsapp: '', password: '', balance: '', withKey: true });
    const [ident, setIdent] = useState('');
    const [reveal, setReveal] = useState<{ title: string; lines: string[] } | null>(null);
    // aksi per baris
    const [open, setOpen] = useState<{ id: string; mode: Mode } | null>(null);
    const [f, setF] = useState<any>({});
    const [ledger, setLedger] = useState<any[]>([]);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async (search = '') => {
        const r = await fetch('/api/admin/reseller' + (search ? `?q=${encodeURIComponent(search)}` : ''));
        if (r.status === 401) return setAuth(false);
        const d = await r.json();
        if (!d.success) return setMsg(d.message || 'Gagal memuat.');
        setAuth(true);
        setCfg({ enabled: d.config.enabled, apiEnabled: d.config.apiEnabled, price: String(d.config.price), discount: String(d.config.discount) });
        setResellers(d.resellers || []); setItems(d.items || []); setExcluded(d.excluded || []); setEdit({});
        setProducts(d.products || []); setScope(d.config.scope === 'selected' ? 'selected' : 'all'); setSlugs(d.config.slugs || []);
    }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { const t = setTimeout(() => { if (auth) load(q); }, 350); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const loginInfo = (u: { username: string; email?: string }, password?: string | null, key?: string | null) => [
        `Akun Reseller`, `Login: ${origin}/login`, `Username: ${u.username}`, ...(u.email ? [`Email: ${u.email}`] : []),
        ...(password ? [`Password: ${password}`] : []), ...(key ? [`API key: ${key}`] : []),
        `Portal reseller (login di sini): ${origin}/reseller`, `Dokumentasi API: ${origin}/docs/api`,
    ];

    async function act(body: any, okMsg: string, after?: (d: any) => void) {
        setBusy(true); const d = await post(body); setBusy(false);
        if (!d.success) { setMsg('✘ ' + (d.message || 'Gagal.')); return false; }
        setMsg('✔ ' + okMsg); after?.(d); load(q); return true;
    }

    async function addNew() {
        await act({ action: 'create', ...form, balance: form.balance || 0 }, 'Reseller dibuat', (d) => {
            const c = d.created;
            setReveal({ title: `Akun ${c.username} dibuat. Kirim info ini ke reseller (password & key hanya tampil sekali):`, lines: loginInfo(c, c.password || form.password, c.key) });
            setForm({ username: '', email: '', whatsapp: '', password: '', balance: '', withKey: true });
        });
    }
    async function addExisting() {
        await act({ action: 'promote', identifier: ident }, 'Akun dijadikan reseller (bisa langsung dipakai login)', (d) => {
            setReveal({ title: `${d.user.username} sekarang reseller. Beri tahu dia untuk login dan buka menu "API Key Reseller":`, lines: loginInfo(d.user) });
            setIdent('');
        });
    }
    const toggle = (id: string, mode: Mode) => { setOpen(open && open.id === id && open.mode === mode ? null : { id, mode }); setF({}); setLedger([]); };
    async function openLedger(u: any) {
        toggle(u.id, 'ledger');
        const r = await fetch(`/api/admin/reseller?view=ledger&userId=${u.id}`); const d = await r.json();
        setLedger(d.ledger || []);
    }
    const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); setMsg('✔ Tersalin'); } catch { setMsg('✘ Gagal menyalin, salin manual.'); } };

    async function saveCfg() {
        const d = await post({ action: 'settings', enabled: cfg.enabled, apiEnabled: cfg.apiEnabled, price: Number(cfg.price), discount: Number(cfg.discount), scope, slugs });
        setMsg(d.success ? '✔ Pengaturan tersimpan' : '✘ ' + d.message); if (d.success) load(q);
    }
    async function saveItem(it: any) {
        const d = await post({ action: 'item_price', itemId: it.itemId, price: edit[it.itemId] });
        setMsg(d.success ? `✔ Harga ${it.product} ${it.label} tersimpan` : '✘ ' + d.message); if (d.success) load(q);
    }

    if (auth === false) return <div className="sne"><div className="auth-page"><div className="auth-card"><h2 style={{ marginTop: 0 }}>Login admin diperlukan</h2><Link className="btn-main" href="/admin" style={{ textDecoration: 'none' }}>Ke Login Admin</Link></div></div></div>;

    const shown = items.filter((i) => !qItem || `${i.product} ${i.label} ${i.apiCode}`.toLowerCase().includes(qItem.toLowerCase()));
    const label = (t: string) => <label className="f-lab" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>{t}</label>;

    return (
        <div className="sne"><div className="sne-wrap" style={{ paddingTop: 20, paddingBottom: 60 }}>
            <div className="sec-head"><div className="ttl"><h2><i className="fa-solid fa-handshake" /> <span>Kelola Reseller</span></h2><p>{resellers.length} reseller · {items.length} SKU di API</p></div><Link className="btn-all" href="/admin">← Panel</Link></div>
            {msg && <p style={{ margin: '10px 0', fontSize: 13 }}>{msg}</p>}

            {reveal && (
                <div className="panel" style={{ marginTop: 12, border: '1px solid #16a34a' }}>
                    <b style={{ fontSize: 13 }}>{reveal.title}</b>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12.5, margin: '8px 0', userSelect: 'all' }}>{reveal.lines.join('\n')}</pre>
                    <button className="btn-main" onClick={() => copy(reveal.lines.join('\n'))}>Salin info login</button>
                    <button className="btn-ghost" style={{ marginLeft: 8 }} onClick={() => setReveal(null)}>Tutup</button>
                </div>
            )}

            <div className="panel" style={{ marginTop: 12 }}>
                <div className="sub-title" style={{ marginTop: 0 }}>Tambah Reseller</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button className={addMode === 'new' ? 'btn-main' : 'btn-ghost'} onClick={() => setAddMode('new')}>Buat akun baru</button>
                    <button className={addMode === 'existing' ? 'btn-main' : 'btn-ghost'} onClick={() => setAddMode('existing')}>Akun yang sudah ada</button>
                </div>
                {addMode === 'new' ? (
                    <>
                        {label('Username (3–20, huruf/angka/_)')}<input style={inp} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                        {label('Email')}<input style={inp} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                        {label('WhatsApp (opsional)')}<input style={inp} value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
                        {label('Password (kosongkan = dibuatkan otomatis)')}<input style={inp} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="min. 8 karakter, huruf + angka" />
                        {label('Saldo awal (Rp, opsional)')}<input style={inp} inputMode="numeric" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value.replace(/\D/g, '') })} />
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0', fontSize: 13 }}><input type="checkbox" checked={form.withKey} onChange={(e) => setForm({ ...form, withKey: e.target.checked })} /> Buat API key sekalian</label>
                        <button className="btn-main" onClick={addNew} disabled={busy}>Buat Reseller</button>
                    </>
                ) : (
                    <>
                        {label('Username atau email akun yang sudah terdaftar')}<input style={inp} value={ident} onChange={(e) => setIdent(e.target.value)} />
                        <p style={{ fontSize: 12, opacity: 0.7, margin: '8px 0' }}>Gratis, tanpa biaya join. Setelah ini user tinggal login seperti biasa lalu buka menu &quot;API Key Reseller&quot;.</p>
                        <button className="btn-main" onClick={addExisting} disabled={busy || !ident.trim()}>Jadikan Reseller</button>
                    </>
                )}
            </div>

            <div className="sub-title">Daftar Reseller</div>
            <div className="sne-search"><input placeholder="Cari username / email reseller..." value={q} onChange={(e) => setQ(e.target.value)} /><i className="fa-solid fa-magnifying-glass" /></div>
            <div className="hist" style={{ marginTop: 10 }}>
                {resellers.map((u) => {
                    const isOpen = open && open.id === u.id ? open.mode : null;
                    return (
                        <div key={u.id} className="h-item" style={{ display: 'block' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                <div className="m"><b>{u.username}{u.reseller_disabled ? ' ⛔ nonaktif' : ''}{u.is_banned ? ' 🚫 banned' : ''}</b>
                                    <small>{u.email}{u.whatsapp ? ' · ' + u.whatsapp : ''}</small>
                                    <small>Gabung {dt(u.reseller_since)} · login terakhir {dt(u.last_login_at)}</small>
                                    <small>Key: {u.api_key_prefix || 'belum ada'} · {u.api_orders} order API selesai</small></div>
                                <div className="r"><b>{rp(u.balance)}</b></div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                <button className="btn-ghost" onClick={() => toggle(u.id, 'saldo')}>Saldo ±</button>
                                <button className="btn-ghost" onClick={() => openLedger(u)}>Mutasi</button>
                                <button className="btn-ghost" onClick={() => { toggle(u.id, 'edit'); setF({ username: u.username, email: u.email, whatsapp: u.whatsapp || '' }); }}>Edit</button>
                                <button className="btn-ghost" onClick={() => toggle(u.id, 'pw')}>Reset password</button>
                                <button className="btn-ghost" disabled={busy} onClick={() => { if (confirm(u.api_key_prefix ? 'Buat key baru? Key lama langsung mati.' : 'Buat API key untuk reseller ini?')) act({ action: 'create_key', userId: u.id }, 'API key dibuat', (d) => setReveal({ title: `API key ${u.username} (hanya tampil sekali):`, lines: [d.key] })); }}>{u.api_key_prefix ? 'Ganti key' : 'Buat key'}</button>
                                {u.api_key_prefix && <button className="btn-ghost" disabled={busy} onClick={() => confirm('Cabut API key?') && act({ action: 'revoke_key', userId: u.id }, 'Key dicabut')}>Cabut key</button>}
                                <button className="btn-ghost" disabled={busy} onClick={() => act({ action: u.reseller_disabled ? 'enable' : 'disable', userId: u.id }, u.reseller_disabled ? 'Reseller diaktifkan' : 'Reseller dinonaktifkan (API ditolak 403)')}>{u.reseller_disabled ? 'Aktifkan' : 'Nonaktifkan'}</button>
                                <button className="btn-ghost" disabled={busy} onClick={() => confirm(u.is_banned ? 'Buka blokir akun ini?' : 'Blokir akun ini? Login & semua sesi langsung tidak berlaku.') && act({ action: 'ban', userId: u.id, banned: !u.is_banned }, u.is_banned ? 'Blokir dibuka' : 'Akun diblokir')}>{u.is_banned ? 'Buka blokir' : 'Blokir'}</button>
                                <button className="btn-ghost" disabled={busy} onClick={() => confirm(`Jadikan ${u.username} user biasa? API key dicabut, saldo tetap.`) && act({ action: 'demote', userId: u.id }, 'Status reseller dicabut')}>Jadikan user biasa</button>
                                <button className="btn-ghost" style={{ color: '#f87171' }} onClick={() => toggle(u.id, 'hapus')}>Hapus</button>
                            </div>

                            {isOpen === 'saldo' && (
                                <div style={{ marginTop: 10 }}>
                                    {label('Nominal (Rp). Positif = tambah, negatif = kurangi')}<input style={inp} inputMode="numeric" placeholder="contoh 50000 atau -20000" value={f.delta || ''} onChange={(e) => setF({ ...f, delta: e.target.value.replace(/[^\d-]/g, '') })} />
                                    {label('Catatan (opsional)')}<input style={inp} value={f.note || ''} onChange={(e) => setF({ ...f, note: e.target.value })} />
                                    <button className="btn-main" style={{ marginTop: 8 }} disabled={busy || !f.delta} onClick={() => act({ action: 'adjust', userId: u.id, delta: f.delta, note: f.note }, 'Saldo diperbarui', () => setOpen(null))}>Simpan Saldo</button>
                                </div>
                            )}
                            {isOpen === 'edit' && (
                                <div style={{ marginTop: 10 }}>
                                    {label('Username')}<input style={inp} value={f.username || ''} onChange={(e) => setF({ ...f, username: e.target.value })} />
                                    {label('Email')}<input style={inp} value={f.email || ''} onChange={(e) => setF({ ...f, email: e.target.value })} />
                                    {label('WhatsApp')}<input style={inp} value={f.whatsapp || ''} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
                                    <button className="btn-main" style={{ marginTop: 8 }} disabled={busy} onClick={() => act({ action: 'update', userId: u.id, ...f }, 'Data reseller diperbarui', () => setOpen(null))}>Simpan</button>
                                </div>
                            )}
                            {isOpen === 'pw' && (
                                <div style={{ marginTop: 10 }}>
                                    {label('Password baru (kosongkan = dibuatkan otomatis)')}<input style={inp} value={f.password || ''} onChange={(e) => setF({ ...f, password: e.target.value })} />
                                    <p style={{ fontSize: 12, opacity: 0.7, margin: '6px 0' }}>Semua sesi login lama reseller ini langsung keluar.</p>
                                    <button className="btn-main" disabled={busy} onClick={() => act({ action: 'reset_password', userId: u.id, password: f.password }, 'Password direset', (d) => { setOpen(null); setReveal({ title: `Password baru ${u.username} (hanya tampil sekali):`, lines: loginInfo(u, d.password || f.password) }); })}>Reset Password</button>
                                </div>
                            )}
                            {isOpen === 'ledger' && (
                                <div style={{ marginTop: 10, fontSize: 12.5 }}>
                                    {ledger.length === 0 && <p style={{ opacity: 0.7 }}>Belum ada mutasi.</p>}
                                    {ledger.map((l: any, i: number) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', borderBottom: '1px solid rgba(128,128,128,.2)' }}><span>{dt(l.created_at)} · {KIND[l.kind] || l.kind}{l.note ? ' · ' + l.note : ''}</span><b style={{ color: Number(l.amount) < 0 ? '#f87171' : '#34d399' }}>{Number(l.amount) > 0 ? '+' : ''}{rp(Number(l.amount))}</b></div>)}
                                </div>
                            )}
                            {isOpen === 'hapus' && (
                                <div style={{ marginTop: 10 }}>
                                    <p style={{ fontSize: 12.5, color: '#f87171' }}>Menghapus akun permanen. Order tetap tersimpan, tapi mutasi saldo dan riwayat isi saldo akun ini ikut terhapus. Ketik username <b>{u.username}</b> untuk konfirmasi.</p>
                                    <input style={inp} value={f.confirm || ''} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
                                    <button className="btn-main" style={{ marginTop: 8, background: '#dc2626' }} disabled={busy || (f.confirm || '').toLowerCase() !== u.username.toLowerCase()} onClick={() => act({ action: 'delete', userId: u.id, confirm: f.confirm }, 'Akun dihapus', () => setOpen(null))}>Hapus Akun</button>
                                </div>
                            )}
                        </div>
                    );
                })}
                {!resellers.length && <p style={{ opacity: 0.7, fontSize: 13 }}>{q ? 'Tidak ada reseller yang cocok.' : 'Belum ada reseller.'}</p>}
            </div>

            <div className="panel" style={{ marginTop: 18 }}>
                <div className="sub-title" style={{ marginTop: 0 }}>Pengaturan</div>
                <label className="f-lab" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Pendaftaran reseller mandiri dibuka</label>
                <label className="f-lab" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={cfg.apiEnabled} onChange={(e) => setCfg({ ...cfg, apiEnabled: e.target.checked })} /> Reseller API aktif (matikan = semua request API ditolak 403)</label>
                {label('Biaya join (Rp)')}<input style={inp} inputMode="numeric" value={cfg.price} onChange={(e) => setCfg({ ...cfg, price: e.target.value.replace(/\D/g, '') })} />
                {label('Diskon reseller (%)')}<input style={inp} inputMode="decimal" value={cfg.discount} onChange={(e) => setCfg({ ...cfg, discount: e.target.value.replace(/[^\d.]/g, '') })} />
                {label('Harga reseller berlaku untuk')}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className={scope === 'all' ? 'btn-main' : 'btn-ghost'} onClick={() => setScope('all')}>Semua produk</button>
                    <button type="button" className={scope === 'selected' ? 'btn-main' : 'btn-ghost'} onClick={() => setScope('selected')}>Produk tertentu saja</button>
                </div>
                {scope === 'selected' && (
                    <div style={{ marginTop: 10 }}>
                        <p style={{ fontSize: 12, opacity: 0.75, margin: '0 0 8px' }}>Hanya produk yang dicentang yang mendapat harga reseller (diskon dan harga khusus). Produk lain tetap harga normal untuk semua orang, termasuk reseller. Dipilih: <b>{slugs.length}</b> dari {products.length}.</p>
                        <input style={inp} placeholder="Cari produk..." value={qProd} onChange={(e) => setQProd(e.target.value)} />
                        <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
                            <button type="button" className="btn-ghost" onClick={() => setSlugs(Array.from(new Set([...slugs, ...products.filter((p) => !qProd || p.name.toLowerCase().includes(qProd.toLowerCase())).map((p) => p.slug.toLowerCase())])))}>Pilih yang tampil</button>
                            <button type="button" className="btn-ghost" onClick={() => setSlugs([])}>Kosongkan</button>
                        </div>
                        <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid rgba(128,128,128,.25)', borderRadius: 10, padding: '4px 10px' }}>
                            {products.filter((p) => !qProd || p.name.toLowerCase().includes(qProd.toLowerCase())).map((p) => (
                                <label key={p.slug} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', fontSize: 13.5 }}>
                                    <input type="checkbox" checked={slugs.includes(p.slug.toLowerCase())} onChange={(e) => setSlugs(e.target.checked ? [...slugs, p.slug.toLowerCase()] : slugs.filter((x) => x !== p.slug.toLowerCase()))} /> {p.name}
                                </label>
                            ))}
                        </div>
                        {slugs.length === 0 && <p style={{ fontSize: 12, color: '#f59e0b', margin: '8px 0 0' }}>Belum ada produk dipilih: tidak ada produk yang mendapat harga reseller.</p>}
                    </div>
                )}
                <p style={{ fontSize: 12, opacity: 0.7, margin: '8px 0' }}>Untuk produk yang masuk program: harga reseller = harga khusus per opsi (di bawah) bila diisi, kalau tidak harga biasa × (1 − diskon), dibulatkan. Kalau harga jual biasa lebih murah, itu yang dipakai.</p>
                <button className="btn-main" onClick={saveCfg}>Simpan Pengaturan</button>
            </div>

            <div className="sub-title">Harga Reseller per Opsi</div>
            <div className="sne-search"><input placeholder="Cari produk / kode API..." value={qItem} onChange={(e) => setQItem(e.target.value)} /><i className="fa-solid fa-magnifying-glass" /></div>
            <div className="hist" style={{ marginTop: 10 }}>
                {shown.map((i) => (
                    <div key={i.itemId} className="h-item" style={{ flexWrap: 'wrap', gap: 8 }}>
                        <div className="m"><b>{i.product} · {i.label}</b><small>Kode API <code>{i.apiCode}</code> · harga biasa {rp(i.publicPrice)} · efektif <b>{rp(i.effective)}</b>{i.eligible === false && <span style={{ color: '#f59e0b' }}> · produk ini tidak masuk program harga reseller (harga normal)</span>}</small></div>
                        <div className="r" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input style={{ width: 110, height: 34, borderRadius: 8, padding: '0 8px' }} inputMode="numeric" placeholder="otomatis"
                                value={edit[i.itemId] ?? (i.resellerOverride ? String(i.resellerOverride) : '')} onChange={(e) => setEdit({ ...edit, [i.itemId]: e.target.value.replace(/\D/g, '') })} />
                            <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => saveItem(i)}>Simpan</button>
                        </div>
                    </div>
                ))}
            </div>

            {excluded.length > 0 && (
                <>
                    <div className="sub-title">Tidak Masuk API ({excluded.length})</div>
                    <p style={{ fontSize: 12, opacity: 0.7 }}>Kode API dibuat dari durasi di nama opsi. Ubah nama opsi di panel produk agar masuk (contoh: &quot;30 Hari&quot;, &quot;3 Jam&quot;, &quot;Lifetime&quot;).</p>
                    <div className="hist">{excluded.map((x) => <div key={x.itemId} className="h-item"><div className="m"><b>{x.product} · {x.label}</b><small>{x.reason}</small></div></div>)}</div>
                </>
            )}
        </div></div>
    );
}
