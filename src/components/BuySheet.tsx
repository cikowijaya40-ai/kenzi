'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, refreshMe, rp, setMeBalance, useMe } from '@/lib/client';
import Turnstile from './Turnstile';
import type { CatItem, CatProduct } from '@/lib/client';

/* ───────── helper tampilan durasi ─────────
   Nama varian dari provider bisa "1 Jam" (Thanhub) atau "ABCD APKMOD 12 HOURS".
   Kalau ada pola angka + satuan, tampilkan sebagai "12 Jam"; kalau tidak, pakai nama aslinya. */
const UNIT: Record<string, string> = {
    hour: 'Jam', hours: 'Jam', hr: 'Jam', hrs: 'Jam', jam: 'Jam',
    day: 'Hari', days: 'Hari', hari: 'Hari',
    week: 'Minggu', weeks: 'Minggu', minggu: 'Minggu',
    month: 'Bulan', months: 'Bulan', bulan: 'Bulan',
};
export function durationOf(name: string): string | null {
    const m = String(name || '').match(/(\d+)\s*(hours?|hrs?|jam|days?|hari|weeks?|minggu|months?|bulan)\b/i);
    return m ? `${m[1]} ${UNIT[m[2].toLowerCase()]}` : null;
}

/** 999 = penanda "tanpa batas" di database Kenzi → tampil sebagai Ready, bukan angka palsu. */
const READY_AT = 999;
function stockChip(it: CatItem): string {
    if (!it.in_stock) return 'Stok habis';
    if (typeof it.stock !== 'number') return 'Tersedia'; // katalog lama di cache belum membawa angka stok
    return it.stock >= READY_AT ? 'Stok: Ready' : `Stok: ${it.stock}`;
}
function stockLine(it: CatItem): string {
    if (typeof it.stock !== 'number' || it.stock >= READY_AT) return 'Stok tersedia';
    return `${it.stock} stok tersedia`;
}

interface Props {
    product: CatProduct;
    onClose: () => void;
}

export default function BuySheet({ product: p, onClose }: Props) {
    const { user } = useMe();
    const router = useRouter();
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [sku, setSku] = useState('');
    const [gameId, setGameId] = useState('');
    const [wa, setWa] = useState('');
    const [email, setEmail] = useState('');
    const [ts, setTs] = useState('');
    const [tsReset, setTsReset] = useState(0);
    const [emailTaken, setEmailTaken] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const sheetRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const downOnOverlay = useRef(false);

    const maint = !!p.maintenance;
    const item = p.items.find((i) => i.sku === sku);
    const price = item?.price || 0;
    const canUseBalance = !!user && !!item && user.balance >= price;
    const needId = /android|id/i.test(p.input_label_1 || '');
    const next = encodeURIComponent(`/produk/${p.slug}`);
    const locked = busy || step === 3;

    /* Kunci scroll halaman di belakang sheet + kembalikan saat ditutup */
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        const prev = { h: html.style.overflow, b: body.style.overflow, pr: body.style.paddingRight };
        const bar = window.innerWidth - html.clientWidth; // cegah layout melompat di desktop
        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
        if (bar > 0) body.style.paddingRight = `${bar}px`;
        sheetRef.current?.focus();
        return () => {
            html.style.overflow = prev.h;
            body.style.overflow = prev.b;
            body.style.paddingRight = prev.pr;
        };
    }, []);

    /* Tombol Esc menutup (kecuali sedang memproses pesanan) */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !locked) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [locked, onClose]);

    useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [step]);

    function pick(it: CatItem) {
        if (!it.in_stock || maint) return;
        setSku(it.sku); setErr(''); setStep(2);
    }

    /** Bayar langsung via QRIS — tidak perlu login. Akun dibuat otomatis dari email untuk pembeli baru. */
    async function pay() {
        if (maint) return setErr('Produk ini sedang maintenance.');
        if (!item) { setStep(1); return; }
        if (needId && !gameId.trim()) return setErr(`${p.input_label_1 || 'ID'} wajib diisi.`);
        if (!user && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setErr('Isi email yang valid untuk menerima lisensi & akunmu.');
        setBusy(true); setErr(''); setEmailTaken(false);
        const r: any = await api('/api/order/checkout', {
            method: 'POST',
            json: { productSlug: p.slug, itemSku: item.sku, gameId: gameId.trim(), whatsapp: wa, email: email.trim(), turnstileToken: ts },
        });
        if (r.success) {
            if (r.account_created) refreshMe(); // sesi baru sudah dipasang server → header langsung menampilkan akun
            setStep(3); // tetap busy: sheet terkunci sampai pindah ke halaman pembayaran
            router.push(`/order/${r.invoice_no}`);
            return;
        }
        setBusy(false);
        setErr(r.message || 'Gagal membuat pembayaran.');
        if (r.code === 'EMAIL_EXISTS') setEmailTaken(true);
        setTs(''); setTsReset((n) => n + 1);
    }

    async function buy() {
        if (maint) return setErr('Produk ini sedang maintenance.');
        if (!item) { setStep(1); return; }
        if (needId && !gameId.trim()) return setErr(`${p.input_label_1 || 'ID'} wajib diisi.`);
        setBusy(true); setErr('');
        const r: any = await api('/api/order/buy', { method: 'POST', json: { productSlug: p.slug, itemSku: item.sku, gameId: gameId.trim(), whatsapp: wa } });
        if (r.success) {
            setMeBalance(r.balance);
            setStep(3); // tetap busy: sheet terkunci sampai pindah ke halaman pesanan
            router.push(`/order/${r.invoice_no}`);
            return;
        }
        setBusy(false);
        setErr(r.message || 'Gagal memproses pesanan.');
        if (r.status === 401) router.push(`/login?next=${next}`);
    }

    const kicker = step === 1 ? 'Pilih Durasi' : step === 2 ? 'Konfirmasi Pesanan' : 'Memproses Pesanan';

    return (
        <div
            className="ks-overlay"
            onMouseDown={(e) => { downOnOverlay.current = e.target === e.currentTarget; }}
            onClick={(e) => { if (e.target === e.currentTarget && downOnOverlay.current && !locked) onClose(); }}
        >
            <div ref={sheetRef} tabIndex={-1} className="ks-sheet" role="dialog" aria-modal="true" aria-labelledby="ks-title">
                <div className="ks-top">
                    <div className="ks-handle" />

                    <div className="ks-stepper" aria-hidden="true">
                        <div className="ks-step">
                            <div className={`ks-dot ${step === 1 ? 'active' : 'done'}`}>{step === 1 ? '1' : <i className="fa-solid fa-check" />}</div>
                            <div className="ks-step-label">Durasi</div>
                        </div>
                        <div className={`ks-step-line ${step > 1 ? 'on' : ''}`} />
                        <div className="ks-step">
                            <div className={`ks-dot ${step >= 2 ? 'active' : ''}`}>2</div>
                            <div className="ks-step-label">Konfirmasi</div>
                        </div>
                    </div>

                    <div className="ks-head">
                        <div style={{ minWidth: 0 }}>
                            <div className="ks-kicker"><i className="fa-solid fa-clock" /> {kicker}</div>
                            <h3 className="ks-title" id="ks-title">{p.name}</h3>
                        </div>
                        <button type="button" className="ks-close" onClick={onClose} disabled={locked} aria-label="Tutup"><i className="fa-solid fa-xmark" /></button>
                    </div>
                </div>

                <div className={`ks-body ${step === 2 && item ? 'has-foot' : ''}`} ref={bodyRef}>
                    {/* ── LANGKAH 1: pilih durasi (sekali klik langsung lanjut) ── */}
                    {step === 1 && (
                        <div className="ks-dur-list">
                            {maint && (
                                <div className="ks-maint" role="status">
                                    <i className="fa-solid fa-screwdriver-wrench" />
                                    <div>
                                        <b>Produk sedang maintenance</b>
                                        {p.maintenance_note || 'Pembelian dinonaktifkan sementara. Silakan cek lagi nanti.'}
                                    </div>
                                </div>
                            )}
                            {p.items.map((it) => {
                                const dur = durationOf(it.name);
                                const off = !it.in_stock || maint;
                                return (
                                    <button key={it.sku} type="button" className={`ks-dur ${sku === it.sku ? 'on' : ''}`} disabled={off} onClick={() => pick(it)}>
                                        <span className="ks-dur-ic"><i className="fa-regular fa-clock" /></span>
                                        <span className="ks-dur-info">
                                            <b>{dur || it.name}</b>
                                            <span className="ks-dur-sub">
                                                {dur && <span>Masa aktif {dur.toLowerCase()}</span>}
                                                <em className={maint ? 'maint' : off ? 'out' : ''}>{maint ? 'Maintenance' : stockChip(it)}</em>
                                            </span>
                                        </span>
                                        <span className="ks-dur-price">
                                            {it.original_price > it.price && <s>{rp(it.original_price)}</s>}
                                            {rp(it.price)}
                                        </span>
                                        <i className="fa-solid fa-chevron-right ks-dur-chev" />
                                    </button>
                                );
                            })}
                            {!p.items.length && <div className="ks-empty">Belum ada varian untuk produk ini.</div>}
                        </div>
                    )}

                    {/* ── LANGKAH 2: konfirmasi ── */}
                    {step === 2 && item && (
                        <>
                            <div className="ks-summary">
                                <div className="ks-row"><span>{p.name} ({durationOf(item.name) || item.name})</span><span>x1</span></div>
                                {user && <div className="ks-row"><span>Saldo kamu</span><b>{rp(user.balance)}</b></div>}
                                <div className="ks-row total"><span>Total</span><b className="ks-total">{rp(price)}</b></div>
                            </div>

                            <div className="ks-field">
                                <label className="ks-label"><i className="fa-solid fa-cart-plus" /> Jumlah</label>
                                <div className="ks-qty">
                                    <div className="ks-qty-info">
                                        <span>{stockLine(item)}</span>
                                        <b>{rp(price)}</b>
                                    </div>
                                    <span className="ks-qty-fixed" title="Satu lisensi per pesanan">1 lisensi</span>
                                </div>
                            </div>

                            <div className="ks-field">
                                <label className="ks-label" htmlFor="ks-gid"><i className="fa-solid fa-user" /> {p.input_label_1 || 'Android ID / User ID'}{!needId && <small> (Opsional)</small>}</label>
                                <input id="ks-gid" className="ks-input" value={gameId} maxLength={100} autoComplete="off" onChange={(e) => setGameId(e.target.value)} placeholder={p.input_placeholder_1 || 'Masukkan ID'} />
                            </div>
                            <div className="ks-field">
                                <label className="ks-label" htmlFor="ks-wa"><i className="fa-brands fa-whatsapp" /> Nomor WhatsApp <small>(Opsional)</small></label>
                                <input id="ks-wa" className="ks-input" value={wa} maxLength={20} inputMode="tel" autoComplete="tel" onChange={(e) => setWa(e.target.value)} placeholder="081234567890" />
                            </div>
                            {user ? (
                                <div className="ks-field">
                                    <label className="ks-label" htmlFor="ks-mail"><i className="fa-solid fa-envelope" /> Email Pengiriman</label>
                                    <input id="ks-mail" className="ks-input" value={user.email} readOnly />
                                </div>
                            ) : user === null && (
                                <div className="ks-field">
                                    <label className="ks-label" htmlFor="ks-mail"><i className="fa-solid fa-envelope" /> Email <small>(untuk lisensi & akun otomatis)</small></label>
                                    <input id="ks-mail" type="email" className="ks-input" value={email} maxLength={120} inputMode="email" autoComplete="email" onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
                                </div>
                            )}
                            {user === null && <Turnstile onToken={setTs} resetKey={tsReset} />}

                            <p className="ks-note">
                                <i className="fa-solid fa-qrcode" />
                                {user
                                    ? ' Klik bayar → QRIS langsung muncul. Lisensi tampil otomatis setelah pembayaran terkonfirmasi dan dikirim ke emailmu.'
                                    : ' Tanpa login! Klik bayar → QRIS langsung muncul. Akunmu dibuat otomatis (username & password dikirim ke email dan ditampilkan setelah bayar); nanti bisa kamu ganti sendiri.'}
                            </p>
                        </>
                    )}

                    {/* ── LANGKAH 3: pindah ke halaman pesanan ── */}
                    {step === 3 && (
                        <div className="ks-redirect"><span className="ks-spin lg" /><p>Pesanan berhasil, membuka halaman lisensi...</p></div>
                    )}
                </div>

                {step === 2 && item && (
                    <div className="ks-foot">
                        {err && <div className="ks-err" role="alert">{err}</div>}

                        {user === undefined ? (
                            <button className="ks-pay" disabled><span className="ks-spin" /> Memuat...</button>
                        ) : (
                            <>
                                <button className="ks-pay" disabled={busy} onClick={pay}>
                                    {busy ? <><span className="ks-spin" /> Membuat QRIS...</> : <><i className="fa-solid fa-qrcode" /> Bayar sekarang · {rp(price)}</>}
                                </button>
                                {emailTaken && <Link className="ks-back" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }} href={`/login?next=${next}`}><i className="fa-solid fa-right-to-bracket" /> Login ke akun ini</Link>}
                                {canUseBalance && (
                                    <button type="button" className="ks-back" disabled={busy} onClick={buy}>
                                        <i className="fa-solid fa-wallet" /> Bayar pakai saldo ({rp(user!.balance)})
                                    </button>
                                )}
                                {user === null && !emailTaken && <Link className="ks-back" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }} href={`/login?next=${next}`}>Sudah punya akun? Login</Link>}
                            </>
                        )}
                        <button type="button" className="ks-back" disabled={busy} onClick={() => { setErr(''); setStep(1); }}><i className="fa-solid fa-arrow-left" /> Ganti durasi</button>
                    </div>
                )}
            </div>
        </div>
    );
}
