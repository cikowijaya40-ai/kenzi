import { NextResponse } from 'next/server';
import { getAllProducts, getProductSales } from '@/lib/products';
import { getPublicSettings } from '@/lib/settings';
import { PUBLIC_CACHE_HEADERS } from '@/lib/cache';

export const dynamic = 'force-dynamic';

/** Jumlah produk yang otomatis mendapat label "Terlaris" (bisa dipaksa on/off per produk di admin). */
const TOP_BESTSELLER = 3;

/**
 * Katalog publik (produk + pengaturan tampilan) dalam 1 request.
 * - Di-cache CDN Vercel 60 dtk (+stale-while-revalidate 5 mnt) → jutaan kunjungan tetap hanya ±1 query/menit.
 * - Harga modal (cost_usd) & data internal TIDAK ikut dikirim.
 */
export async function GET() {
    try {
        const [rawProducts, settings, sales] = await Promise.all([getAllProducts(false), getPublicSettings(), getProductSales()]);

        // Total terjual = penjualan asli (pesanan lunas) + tambahan manual dari admin
        const soldOf = (p: any) => (sales[p.slug] || 0) + Math.max(0, Number(p.sold_offset) || 0);
        // Terlaris otomatis: TOP_BESTSELLER produk dengan total terjual terbanyak (minimal 1 terjual)
        const autoTop = new Set(
            [...rawProducts].filter((p) => soldOf(p) > 0).sort((a, b) => soldOf(b) - soldOf(a)).slice(0, TOP_BESTSELLER).map((p) => p.slug),
        );
        // Produk yang disematkan (pinned) selalu di paling atas; urutan lainnya tetap (sort_order). sort() stabil.
        const products = [...rawProducts].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

        const data = products.map((p) => ({
            slug: p.slug, name: p.name, category_slug: p.category_slug, icon_url: p.icon_url, banner_url: p.banner_url || '',
            description: p.description || '', badge: p.badge || '', publisher: p.publisher || '',
            input_label_1: p.input_label_1, input_placeholder_1: p.input_placeholder_1, is_featured: p.is_featured,
            maintenance: Boolean(p.maintenance), maintenance_note: p.maintenance ? (p.maintenance_note || '') : '',
            pinned: Boolean(p.pinned),
            sold: p.show_sold !== false && soldOf(p) > 0 ? soldOf(p) : null,
            bestseller: p.bestseller_mode === 'on' || (p.bestseller_mode !== 'off' && autoTop.has(p.slug)),
            items: (p.items || []).filter((i) => i.is_active !== false).map((i) => ({
                sku: i.sku, name: i.name, price: Number(i.price), original_price: Number(i.original_price || i.price),
                badge: i.badge || '', in_stock: i.in_stock !== false && (i.stock ?? 999) > 0, stock: Math.max(0, Number(i.stock ?? 999)),
            })),
        }));
        return NextResponse.json({ success: true, products: data, settings }, { headers: PUBLIC_CACHE_HEADERS });
    } catch (e: any) {
        return NextResponse.json({ success: false, message: 'Gagal memuat katalog' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }
}
