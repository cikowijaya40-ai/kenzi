'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const rp = (n: number) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

async function call(body?: any) {
    const r = await fetch('/api/admin/thanhub', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    const d = await r.json().catch(() => ({}));
    return { ...d, status: r.status };
}

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
    return (
        <div className="panel" style={{ marginTop: 14, borderColor: done ? '#166534' : undefined }}>
            <div className="sub-title" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 28, height: 28, borderRadius: 99, background: done ? '#22c55e' : '#ffc21a', color: '#1a1200', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14 }}>{done ? '✓' : n}</span>
                {title}
            </div>
            {children}
        </div>
    );
}

export default function AdminThanhub() {
    const [auth, setAuth] = useState<boolean | null>(null);
    const [baseUrl, setBaseUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [hasKey, setHasKey] = useState(false);
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState('');
    const [res, setRes] = useState<{ ok: boolean; t: string } | null>(null);
    const [info, setInfo] = useState<{ balance: number; products: number; variants: number } | null>(null);

    useEffect(() => {
        call().then(async (d) => {
            if (d.status === 401) return setAuth(false);
            setAuth(true); setBaseUrl(d.baseUrl || ''); setHasKey(!!d.hasKey);
            if (d.hasKey && d.baseUrl) { const b = await call({ action: 'balance' }); if (b.success) setInfo(b); }
        });
    }, []);

    async function save() {
        setBusy('save'); setRes(null);
        const d = await call({ action: 'save', baseUrl, apiKey });
        setBusy('');
        if (d.success) { setRes({ ok: true, t: `Terhubung! ${d.name ? 'Akun: ' + d.name + '. ' : ''}Saldo Thanhub kamu ${rp(d.balance)} • ${d.products} produk • ${d.variants} varian.` }); setInfo(d); setHasKey(true); setApiKey(''); }
        else setRes({ ok: false, t: d.message || 'Gagal.' });
    }
    if (auth === false) return <div className="sne"><div className="auth-page"><div className="auth-card"><h2 style={{ marginTop: 0 }}>Login admin dulu ya</h2><Link className="btn-main" href="/admin" style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>Ke Login Admin</Link></div></div></div>;

    const connected = hasKey && !!baseUrl;
    const tip: React.CSSProperties = { fontSize: 13.5, lineHeight: 1.65, color: '#cfe0ff' };
    const warn: React.CSSProperties = { background: 'rgba(255,194,26,.1)', border: '1px solid rgba(255,194,26,.4)', borderRadius: 12, padding: '10px 12px', fontSize: 13, color: '#ffe08a', marginTop: 10, lineHeight: 1.55 };

    return (
        <div className="sne"><div className="sne-wrap" style={{ paddingTop: 20, paddingBottom: 70 }}>
            <div className="sec-head">
                <div className="ttl"><h2><i className="fa-solid fa-plug" /> <span>Sambungkan Thanhub</span></h2><p>Key dikirim otomatis dari Thanhub — ikuti 4 langkah ini</p></div>
                <Link className="btn-all" href="/admin">← Panel</Link>
            </div>

            <div className="wallet" style={{ marginTop: 6 }}>
                <small>Status</small>
                <b style={{ fontSize: 22 }}>{connected ? '🟢 Terhubung' : '🔴 Belum terhubung'}</b>
                {info && <p style={{ margin: '8px 0 0', fontSize: 13 }}>Saldo di Thanhub: <b>{rp(info.balance)}</b> · {info.products} produk · {info.variants} varian</p>}
                {info && info.balance < 20000 && <div style={warn}>⚠️ Saldo Thanhub kamu tinggal sedikit. Kalau habis, pembelian di webmu akan gagal (saldo pembeli otomatis dikembalikan). Isi saldo di Thanhub.</div>}
            </div>

            <Step n={1} title="Siapkan akun Thanhub" done={connected}>
                <div style={tip}>
                    Chat admin Thanhub (si Th), lalu minta 3 hal:
                    <ol className="how-list" style={{ marginTop: 8 }}>
                        <li><b>Akun Thanhub</b> (email + password untuk login).</li>
                        <li><b>Alamat web Thanhub</b> (contoh: <code>https://namathanhub.my.id</code>).</li>
                        <li><b>Isi saldo</b> sebagai modal. Setiap key yang laku di webmu, saldo ini berkurang sebesar harga modal.</li>
                    </ol>
                </div>
            </Step>

            <Step n={2} title="Ambil API Key di Thanhub" done={connected}>
                <ol className="how-list" style={tip as any}>
                    <li>Buka <b>alamat Thanhub + /resseler</b>, contoh <code>https://namathanhub.my.id/resseler</code></li>
                    <li>Login pakai email &amp; password akun Thanhub tadi.</li>
                    <li>Cari kotak <b>“API Key”</b>. Di kolom <b>Nama key</b> ketik bebas, misalnya <code>Web KENZIxCheat</code>.</li>
                    <li>Kolom <b>“IP server webmu”</b> <u>KOSONGKAN SAJA</u>.</li>
                    <li>Klik tombol <b>Buat key</b>. Akan muncul tulisan panjang diawali <code>thb_</code>.</li>
                    <li>Klik <b>Salin</b> sekarang juga.</li>
                </ol>
                <div style={warn}>⚠️ Key <b>cuma tampil sekali</b>. Kalau halaman sudah ditutup dan lupa menyalin, buat key baru lagi (maksimal 5 key). <br />⚠️ Jangan isi kolom IP. Server Vercel punya IP yang berubah-ubah, kalau diisi nanti ditolak.</div>
            </Step>

            <Step n={3} title="Tempel di sini lalu tes" done={connected}>
                <label className="f-lab">Alamat Thanhub</label>
                <div className="f-in"><input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://namathanhub.my.id" autoComplete="off" /></div>
                <label className="f-lab">API Key (diawali thb_)</label>
                <div className="f-in">
                    <input type={show ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={hasKey ? 'Sudah tersimpan — kosongkan jika tidak ingin ganti' : 'thb_xxxxxxxxxxxxxxxx'} autoComplete="off" />
                    <button type="button" className="eye" onClick={() => setShow(!show)} aria-label="Tampilkan"><i className={show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'} /></button>
                </div>
                {res && <div className={res.ok ? 'vc-msg ok' : 'alert on'} style={res.ok ? { color: '#4ade80', marginTop: 12, fontSize: 14 } : { marginTop: 12 }}>{res.ok ? '✅ ' : '❌ '}{res.t}</div>}
                <button className="btn-pay" disabled={busy === 'save'} onClick={save}><i className="fa-solid fa-plug" /> {busy === 'save' ? 'Mengetes...' : 'Simpan & Tes Koneksi'}</button>
                <p style={{ ...tip, fontSize: 12, marginTop: 10, opacity: .8 }}>Alamat yang ditempel dengan <code>/resseler</code> atau <code>/api/v1</code> di belakangnya tidak masalah, otomatis dirapikan.</p>
            </Step>

            <Step n={4} title="Tambah produk secara manual" done={connected}>
                <div style={tip}>Tidak ada tarik produk otomatis. Buka <b>Panel → tab Produk</b>, klik <b>Tambah Produk Baru</b>, lalu tambahkan varian. Isi kolom <b>SKU</b> dengan <b>ID varian di Thanhub</b> (contoh <code>123</code> atau <code>thb:123</code>), lalu atur harga jual &amp; stok sendiri.</div>
                <Link className="btn-ghost" href="/admin" style={{ display: 'block', textAlign: 'center', marginTop: 10 }}>Ke Panel Produk →</Link>
            </Step>

            <div className="panel" style={{ marginTop: 14 }}>
                <div className="sub-title" style={{ marginTop: 0 }}>Kalau ada masalah</div>
                <div style={{ ...tip, fontSize: 13 }}>
                    <p style={{ margin: '0 0 8px' }}><b>“API key salah / dicabut”</b> → salah salin. Buat key baru di Thanhub lalu tempel ulang tanpa spasi.</p>
                    <p style={{ margin: '0 0 8px' }}><b>“Thanhub menolak server ini”</b> → waktu buat key kamu mengisi kolom IP. Buat key baru, kolom IP kosongkan.</p>
                    <p style={{ margin: '0 0 8px' }}><b>“Tidak bisa terhubung”</b> → alamat Thanhub salah ketik.</p>
                    <p style={{ margin: '0 0 8px' }}><b>“Saldo tidak cukup”</b> → isi saldo di Thanhub.</p>
                    <p style={{ margin: 0 }}><b>Pembeli bilang gagal beli?</b> Saldo pembeli otomatis kembali penuh. Cek saldo Thanhub-mu.</p>
                </div>
            </div>
        </div></div>
    );
}
