import { requireDb } from './supabase';
import { memo } from './cache';

/**
 * Pengaturan & HARGA reseller. Modul ini sengaja kecil dan hanya bergantung pada database,
 * supaya bisa dipakai alur beli (wallet.ts, checkout.ts) tanpa import melingkar.
 * SEMUA harga dihitung di server dari database; angka dari browser tidak pernah dipercaya.
 */
export interface ResellerConfig { enabled: boolean; price: number; discount: number; apiEnabled: boolean }

/** Dibaca langsung dari DB dengan cache 5 detik (bukan cache 60 detik settings) supaya tombol "matikan API" cepat berlaku. */
export async function getResellerConfig(): Promise<ResellerConfig> {
    return memo('rsl:cfg', 5_000, async () => {
        const { data } = await requireDb().from('site_settings').select('value').eq('key', 'main_config').maybeSingle();
        const v: any = data?.value || {};
        const num = (x: unknown, d: number) => (x === undefined || x === null || x === '' || Number.isNaN(Number(x)) ? d : Number(x));
        return {
            enabled: v.reseller_enabled !== false,
            price: Math.min(100_000_000, Math.max(0, Math.round(num(v.reseller_price, 50000)))),
            discount: Math.min(90, Math.max(0, num(v.reseller_discount, 20))),
            apiEnabled: v.reseller_api_enabled !== false,
        };
    });
}

/* ═════════ HARGA & SKU ═════════ */

/**
 * Harga reseller per opsi: reseller_price bila diisi admin, kalau tidak harga * (1 - diskon/100), dibulatkan.
 * Kalau harga jual biasa (termasuk promo) lebih murah, harga itu yang dipakai: selalu yang paling murah.
 */
export function resellerPriceOf(item: { price: number; reseller_price?: number | null }, discountPct: number): number {
    const pub = Math.round(Number(item.price) || 0);
    const rp = Number(item.reseller_price);
    const viaDiscount = Math.round(pub * (1 - Math.min(90, Math.max(0, discountPct)) / 100));
    const base = Number.isFinite(rp) && rp > 0 ? Math.round(rp) : viaDiscount;
    return Math.max(0, Math.min(base, pub));
}

/**
 * Harga reseller untuk pembelian lewat WEB (saldo maupun QRIS) oleh akun reseller AKTIF.
 * null = tidak berlaku (bukan reseller / dinonaktifkan / kolom belum ada / harga reseller tidak lebih murah) -> pakai harga biasa.
 */
export async function resellerWebPrice(userId: string, slug: string, sku: string): Promise<number | null> {
    try {
        const db = requireDb();
        const { data: u, error } = await db.from('users').select('is_reseller, reseller_disabled').eq('id', userId).maybeSingle();
        if (error || !u || !u.is_reseller || u.reseller_disabled) return null;
        const { data: it, error: e2 } = await db.from('product_items').select('price, reseller_price').eq('product_slug', slug).eq('sku', sku).maybeSingle();
        if (e2 || !it) return null;
        const cfg = await getResellerConfig();
        const pub = Math.round(Number(it.price));
        const rp = resellerPriceOf({ price: pub, reseller_price: it.reseller_price }, cfg.discount);
        return rp > 0 && rp < pub ? rp : null;
    } catch {
        return null;
    }
}

/** Peta harga reseller untuk semua opsi aktif: kunci "slug|sku" -> harga. Hanya opsi yang benar-benar lebih murah dari harga biasa. */
export async function resellerPriceMap(): Promise<Record<string, number>> {
    return memo('rsl:webprices', 15_000, async () => {
        const [cfg, { data, error }] = await Promise.all([
            getResellerConfig(),
            requireDb().from('product_items').select('product_slug, sku, price, reseller_price').or('is_active.is.null,is_active.eq.true').range(0, 4999),
        ]);
        if (error) throw new Error(error.message);
        const out: Record<string, number> = {};
        for (const it of data || []) {
            const pub = Math.round(Number(it.price));
            const rp = resellerPriceOf({ price: pub, reseller_price: it.reseller_price }, cfg.discount);
            if (rp > 0 && rp < pub) out[`${it.product_slug}|${it.sku}`] = rp;
        }
        return out;
    });
}
