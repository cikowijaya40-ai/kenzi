'use client';
import { useState } from 'react';
import { fixImg, fmtSold, useCatalog } from '@/lib/client';
import BuySheet from './BuySheet';

/**
 * Halaman detail produk. Pembelian sekarang lewat BuySheet (2 langkah: Durasi → Konfirmasi)
 * yang otomatis terbuka saat halaman dibuka (mis. dari banner / tautan langsung).
 * Deskripsi & cara pasang tetap tersedia di bawah header.
 */
export default function ProductBuy({ slug }: { slug: string }) {
    const { data, loading } = useCatalog();
    const [open, setOpen] = useState(true);

    const p = data?.products.find((x) => x.slug === slug);
    if (!p) {
        return <div className="kx-wrap"><div className="kx-empty">{loading ? 'Memuat produk...' : 'Produk tidak ditemukan.'}</div></div>;
    }
    const maint = !!p.maintenance;
    const soldOut = p.items.length > 0 && p.items.every((i) => !i.in_stock);

    return (
        <div className="kx-wrap">
            <div className="buy-head">
                <div className="pic"><img src={fixImg(p.icon_url || p.banner_url)} alt="" /></div>
                <div style={{ minWidth: 0 }}>
                    <span className="cat">{p.publisher || p.category_slug}</span>
                    <h1>{p.name}</h1>
                    {(p.bestseller || p.pinned || p.sold) ? (
                        <div className="kx-chips">
                            {p.bestseller && <span className="hot"><i className="fa-solid fa-fire" /> Terlaris</span>}
                            {p.pinned && <span className="pin"><i className="fa-solid fa-thumbtack" /> Unggulan</span>}
                            {p.sold ? <span className="sold"><i className="fa-solid fa-bag-shopping" /> Terjual {fmtSold(p.sold)}</span> : null}
                        </div>
                    ) : null}
                </div>
            </div>

            {maint && (
                <div className="kx-maint-banner" role="status">
                    <i className="fa-solid fa-screwdriver-wrench" />
                    <div>
                        <b>Produk sedang maintenance</b>
                        {p.maintenance_note || 'Pembelian dinonaktifkan sementara. Silakan cek lagi nanti.'}
                    </div>
                </div>
            )}

            <button type="button" className="ks-pay ks-open" disabled={soldOut || maint} onClick={() => setOpen(true)}>
                {maint
                    ? <><i className="fa-solid fa-screwdriver-wrench" /> Sedang maintenance</>
                    : <><i className="fa-solid fa-cart-shopping" /> {soldOut ? 'Stok habis' : 'Pilih durasi & beli'}</>}
            </button>

            <div className="sub-title">Deskripsi Produk</div>
            <div className="panel"><div className="prose">{p.description || 'Belum ada deskripsi untuk produk ini.'}</div></div>

            <div className="sub-title">Cara Pasang</div>
            <div className="panel">
                <ol className="how-list">
                    <li>Bayar lewat QRIS (tanpa perlu login), lisensi langsung muncul di halaman pesanan setelah lunas.</li>
                    <li>Salin lisensi/key yang kamu dapat.</li>
                    <li>Unduh dan pasang aplikasi dari tautan resmi admin.</li>
                    <li>Buka aplikasi, tempel lisensi, lalu aktifkan.</li>
                </ol>
            </div>

            {open && !maint && <BuySheet product={p} onClose={() => setOpen(false)} />}
        </div>
    );
}
