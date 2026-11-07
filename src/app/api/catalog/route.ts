import { NextResponse } from 'next/server';
import { getAllProducts } from '@/lib/products';
import { getPublicSettings } from '@/lib/settings';
import { PUBLIC_CACHE_HEADERS } from '@/lib/cache';

export const dynamic = 'force-dynamic';

/**
 * Katalog publik (produk + pengaturan tampilan) dalam 1 request.
 * - Di-cache CDN Vercel 60 dtk (+stale-while-revalidate 5 mnt) → jutaan kunjungan tetap hanya ±1 query/menit.
 * - Harga modal (cost_usd) & data internal TIDAK ikut dikirim.
 */
export async function GET() {
    try {
        const [products, settings] = await Promise.all([getAllProducts(false), getPublicSettings()]);
        const data = products.map((p) => ({
            slug: p.slug, name: p.name, category_slug: p.category_slug, icon_url: p.icon_url, banner_url: p.banner_url || '',
            description: p.description || '', badge: p.badge || '', publisher: p.publisher || '',
            input_label_1: p.input_label_1, input_placeholder_1: p.input_placeholder_1, is_featured: p.is_featured,
            maintenance: Boolean(p.maintenance), maintenance_note: p.maintenance ? (p.maintenance_note || '') : '',
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
