'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

const rp = (n: number) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-');

async function post(body: any) {
    const r = await fetch('/api/admin/reseller', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
}

export default function AdminReseller() {
    const [auth, setAuth] = useState<boolean | null>(null);
    const [cfg, setCfg] = useState({ enabled: true, apiEnabled: true, price: '50000', discount: '20' });
    const [resellers, setResellers] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [excluded, setExcluded] = useState<any[]>([]);
    const [edit, setEdit] = useState<Record<string, string>>({});
    const [q, setQ] = useState('');
    const [msg, setMsg] = useState('');

    const load = useCallback(async () => {
        const r = await fetch('/api/admin/reseller');
        if (r.status === 401) return setAuth(false);
        const d = await r.json();
        if (!d.success) return setMsg(d.message || 'Gagal memuat.');
        setAuth(true);
        setCfg({ enabled: d.config.enabled, apiEnabled: d.config.apiEnabled, price: String(d.config.price), discount: String(d.config.discount) });
        setResellers(d.resellers || []); setItems(d.items || []); setExcluded(d.excluded || []); setEdit({});
    }, []);
    useEffect(() => { load(); }, [load]);

    async function saveCfg() {
        const d = await post({ action: 'settings', enabled: cfg.enabled, apiEnabled: cfg.apiEnabled, price: Number(cfg.price), discount: Number(cfg.discount) });
        setMsg(d.success ? '✔ Pengaturan tersimpan' : d.message);
        if (d.success) load();
    }
    async function toggle(u: any) {
        if (!confirm(u.reseller_disabled ? `Aktifkan lagi ${u.username}?` : `Nonaktifkan reseller ${u.username}? API key-nya langsung ditolak (403).`)) return;
        const d = await post({ action: u.reseller_disabled ? 'enable' : 'disable', userId: u.id });
        setMsg(d.success ? '✔ Tersimpan' : d.message); load();
    }
    async function revoke(u: any) {
        if (!confirm(`Cabut API key ${u.username}?`)) return;
        const d = await post({ action: 'revoke_key', userId: u.id });
        setMsg(d.success ? '✔ Key dicabut' : d.message); load();
    }
    async function saveItem(it: any) {
        const d = await post({ action: 'item_price', itemId: it.itemId, price: edit[it.itemId] });
        setMsg(d.success ? `✔ Harga ${it.product} ${it.label} tersimpan` : d.message);
        if (d.success) load();
    }

    if (auth === false) return <div className="sne"><div className="auth-page"><div className="auth-card"><h2 style={{ marginTop: 0 }}>Login admin diperlukan</h2><Link className="btn-main" href="/admin" style={{ textDecoration: 'none' }}>Ke Login Admin</Link></div></div></div>;

    const shown = items.filter((i) => !q || `${i.product} ${i.label} ${i.apiCode}`.toLowerCase().includes(q.toLowerCase()));

    return (
        <div className="sne"><div className="sne-wrap" style={{ paddingTop: 20, paddingBottom: 60 }}>
            <div className="sec-head"><div className="ttl"><h2><i className="fa-solid fa-handshake" /> <span>Open Reseller &amp; API</span></h2><p>{resellers.length} reseller · {items.length} SKU di API</p></div><Link className="btn-all" href="/admin">← Panel</Link></div>
            {msg && <p style={{ margin: '10px 0', fontSize: 13 }}>{msg}</p>}

            <div className="panel" style={{ marginTop: 12 }}>
                <div className="sub-title" style={{ marginTop: 0 }}>Pengaturan</div>
                <label className="f-lab" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Pendaftaran reseller dibuka</label>
                <label className="f-lab" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={cfg.apiEnabled} onChange={(e) => setCfg({ ...cfg, apiEnabled: e.target.checked })} /> Reseller API aktif (matikan = semua request API ditolak 403)</label>
                <label className="f-lab">Biaya join (Rp)</label><div className="f-in"><input inputMode="numeric" value={cfg.price} onChange={(e) => setCfg({ ...cfg, price: e.target.value.replace(/\D/g, '') })} /></div>
                <label className="f-lab">Diskon global reseller (%)</label><div className="f-in"><input inputMode="decimal" value={cfg.discount} onChange={(e) => setCfg({ ...cfg, discount: e.target.value.replace(/[^\d.]/g, '') })} /></div>
                <p style={{ fontSize: 12, opacity: 0.7, margin: '8px 0' }}>Harga reseller = harga khusus per opsi (di bawah) bila diisi, kalau tidak harga biasa × (1 − diskon), dibulatkan. Kalau harga jual biasa lebih murah, itu yang dipakai.</p>
                <button className="btn-main" onClick={saveCfg}>Simpan Pengaturan</button>
            </div>

            <div className="sub-title">Daftar Reseller</div>
            <div className="hist">
                {resellers.map((u) => (
                    <div key={u.id} className="h-item" style={{ flexWrap: 'wrap', gap: 8 }}>
                        <div className="m"><b>{u.username}{u.reseller_disabled ? ' ⛔ nonaktif' : ''}{u.is_banned ? ' 🚫' : ''}</b><small>{u.email} · gabung {dt(u.reseller_since)}</small><small>Key: {u.api_key_prefix || 'belum ada'} · {u.api_orders} order API selesai</small></div>
                        <div className="r"><b>{rp(u.balance)}</b>
                            <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => toggle(u)}>{u.reseller_disabled ? 'Aktifkan' : 'Nonaktifkan'}</button>
                            {u.api_key_prefix && <button className="btn-ghost" style={{ padding: '4px 10px', marginLeft: 6 }} onClick={() => revoke(u)}>Cabut key</button>}
                        </div>
                    </div>
                ))}
                {!resellers.length && <p style={{ opacity: 0.7, fontSize: 13 }}>Belum ada reseller.</p>}
            </div>

            <div className="sub-title">Harga Reseller per Opsi</div>
            <div className="sne-search"><input placeholder="Cari produk / kode API..." value={q} onChange={(e) => setQ(e.target.value)} /><i className="fa-solid fa-magnifying-glass" /></div>
            <div className="hist" style={{ marginTop: 10 }}>
                {shown.map((i) => (
                    <div key={i.itemId} className="h-item" style={{ flexWrap: 'wrap', gap: 8 }}>
                        <div className="m"><b>{i.product} · {i.label}</b><small>Kode API <code>{i.apiCode}</code> · harga biasa {rp(i.publicPrice)} · efektif <b>{rp(i.effective)}</b></small></div>
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
