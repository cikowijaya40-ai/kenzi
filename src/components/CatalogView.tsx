'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fixImg, rp, useCatalog } from '@/lib/client';
import BuySheet from './BuySheet';

const catLabel = (s: string) => s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function CatalogView({ home = false }: { home?: boolean }) {
    const { data, loading } = useCatalog();
    const [q, setQ] = useState('');
    const [searching, setSearching] = useState(false);
    const [cat, setCat] = useState('all');
    const track = useRef<HTMLDivElement>(null);
    const [slide, setSlide] = useState(0);
    const [sheetSlug, setSheetSlug] = useState<string | null>(null);

    const products = data?.products || [];
    const S = data?.settings;
    const banners = (S?.banners || []).filter((b) => b && b.image);
    const cats = useMemo(() => Array.from(new Set(products.map((p) => p.category_slug).filter(Boolean))), [products]);
    const list = useMemo(() => {
        const t = q.trim().toLowerCase();
        return products.filter((p) => (cat === 'all' || p.category_slug === cat) && (!t || p.name.toLowerCase().includes(t)));
    }, [products, q, cat]);
    const shown = home && !q && cat === 'all' ? list.slice(0, 12) : list;

    useEffect(() => {
        if (banners.length < 2) return;
        const id = setInterval(() => {
            const el = track.current;
            if (!el) return;
            const next = (Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)) + 1) % banners.length;
            el.scrollTo({ left: el.clientWidth * next, behavior: 'smooth' });
        }, 4500);
        return () => clearInterval(id);
    }, [banners.length]);

    const marq = S?.announcement_active && S?.announcement ? S.announcement : `Selamat datang di ${S?.site_name || 'toko kami'} — isi saldo, beli key otomatis!`;

    return (
        <div className="kx-wrap">
            {home && (
                <>
                    <section className="kx-banner" aria-label="Promo">
                        <div className="track" ref={track} onScroll={(e) => { const el = e.currentTarget; setSlide(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1))); }}>
                            {banners.length ? banners.map((b) => (
                                <Link key={b.id} className="slide" href={b.slug ? `/produk/${b.slug}` : '/produk'}>
                                    <img src={fixImg(b.image)} alt={b.title} loading="eager" />
                                </Link>
                            )) : (
                                <div className="slide default">
                                    <span className="chip"><i className="fa-solid fa-crown" /> Premium Access</span>
                                    <h2>{S?.site_name || 'KENZIxCheat'}</h2>
                                    <p>{S?.hero_desc || 'Key license, mod cheat & premium access. Proses otomatis, cepat, dan aman.'}</p>
                                    <Link href="/produk" className="go">Lihat Produk <i className="fa-solid fa-arrow-right" /></Link>
                                </div>
                            )}
                        </div>
                        {banners.length > 1 && <div className="dots">{banners.map((b, i) => <i key={b.id} className={i === slide ? 'on' : ''} />)}</div>}
                    </section>

                    <div className="kx-marquee" aria-label="Info"><div className="run">
                        {Array.from({ length: 6 }).map((_, i) => <span key={i}>{marq}<i className="fa-solid fa-bolt" /></span>)}
                    </div></div>

                    <div className="kx-how">
                        <div className="step"><i className="fa-solid fa-user-plus" /><b>Daftar</b><span>atau beli tanpa login</span></div>
                        <div className="step"><i className="fa-solid fa-wallet" /><b>Isi Saldo</b><span>lewat QRIS</span></div>
                        <div className="step"><i className="fa-solid fa-key" /><b>Key Instan</b><span>langsung masuk</span></div>
                    </div>
                </>
            )}

            <h2 className="kx-title" id="produk">{q ? 'HASIL PENCARIAN' : cat === 'all' ? (home ? 'PRODUK TERSEDIA' : 'SEMUA PRODUK') : catLabel(cat).toUpperCase()} <span className="live" aria-hidden="true" /></h2>

            <div className={`kx-toolbar ${searching ? 'searching' : ''}`}>
                <span className="ico" aria-hidden="true"><i className="fa-solid fa-filter" /></span>
                <div className="chips" role="tablist" aria-label="Kategori">
                    <button className={`chip ${cat === 'all' ? 'active' : ''}`} onClick={() => setCat('all')}>SEMUA</button>
                    {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{catLabel(c).toUpperCase()}</button>)}
                </div>
                <button className="sbtn" aria-label="Cari produk" onClick={() => setSearching(true)}><i className="fa-solid fa-magnifying-glass" /></button>
                <div className="search">
                    <input type="search" placeholder="Cari produk..." value={q} autoFocus={searching} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search" aria-label="Cari produk" />
                    <button className="sbtn" aria-label="Tutup pencarian" onClick={() => { setSearching(false); setQ(''); }}><i className="fa-solid fa-xmark" /></button>
                </div>
            </div>

            <div className="kx-products">
                {loading && !products.length && Array.from({ length: 4 }).map((_, i) => <div key={i} className="kx-card skeleton" />)}
                {shown.map((p) => {
                    const items = p.items || [];
                    const maint = !!p.maintenance;
                    const soldOut = items.length > 0 && items.every((i) => !i.in_stock);
                    const prices = items.filter((i) => i.in_stock).map((i) => i.price);
                    const min = prices.length ? Math.min(...prices) : items.length ? Math.min(...items.map((i) => i.price)) : 0;
                    const desc = (p.description || '').replace(/\s+/g, ' ').trim().slice(0, 140);
                    return (
                        <article key={p.slug} className={`kx-card${maint ? ' maint' : ''}`}>
                            <div className="side">
                                <Link href={`/produk/${p.slug}`} className="img" aria-label={p.name} onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); setSheetSlug(p.slug); }}>
                                    <img src={fixImg(p.icon_url || p.banner_url)} alt={p.name} loading="lazy" decoding="async" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                                </Link>
                                {items.length > 0 && <span className="tag"><i className="fa-regular fa-clock" /> {items.length} DURASI</span>}
                            </div>
                            <div className="main">
                                <div className="top">
                                    <span className="cat">{(p.publisher || catLabel(p.category_slug || 'produk')).toUpperCase()}</span>
                                    {min > 0 && <span className="price"><small>mulai</small> {rp(min)}</span>}
                                </div>
                                <h3>{p.name}</h3>
                                {desc && <p className="desc">{desc}</p>}
                                <div className="meta">
                                    {maint
                                        ? <span className="pill maint"><i /> Maintenance</span>
                                        : soldOut
                                            ? <span className="pill out"><i /> Habis</span>
                                            : <span className="pill on"><i /> Tersedia</span>}
                                    <span className="auto"><i className="fa-solid fa-bolt" /> Key otomatis</span>
                                </div>
                                {maint && p.maintenance_note && <p className="maint-note"><i className="fa-solid fa-screwdriver-wrench" /> {p.maintenance_note}</p>}
                                <div className="buy">
                                    {maint
                                        ? <button className="maint" disabled><i className="fa-solid fa-screwdriver-wrench" /> SEDANG MAINTENANCE</button>
                                        : soldOut
                                            ? <button disabled><i className="fa-solid fa-ban" /> STOK HABIS</button>
                                            : <button onClick={() => setSheetSlug(p.slug)}><i className="fa-solid fa-cart-shopping" /> BELI SEKARANG</button>}
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>
            {!loading && !shown.length && <div className="kx-empty">Produk tidak ditemukan.</div>}
            {home && list.length > shown.length && <div style={{ textAlign: 'center', marginTop: 16 }}><Link className="kx-btn-line" href="/produk">Lihat semua produk <i className="fa-solid fa-arrow-right" /></Link></div>}

            {home && (
                <section className="kx-benefits">
                    <div><i className="fa-solid fa-shield-halved" /><span>Pembayaran Aman</span></div>
                    <div><i className="fa-solid fa-bolt" /><span>Key Instan</span></div>
                    <div><i className="fa-solid fa-headset" /><span>CS Responsif</span></div>
                    <div><i className="fa-solid fa-rotate-left" /><span>Refund Otomatis</span></div>
                </section>
            )}

            {sheetSlug && (() => {
                const sp = products.find((x) => x.slug === sheetSlug);
                return sp ? <BuySheet product={sp} onClose={() => setSheetSlug(null)} /> : null;
            })()}
        </div>
    );
}
