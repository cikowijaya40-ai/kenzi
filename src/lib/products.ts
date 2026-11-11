import { INITIAL_PRODUCTS } from './data';
import { Product, ProductItem } from './types';
import { getSupabase, getSupabaseAdmin } from './supabase';
import { memo, bust } from './cache';

const globalForProducts = globalThis as unknown as {
    cachedProducts?: Product[];
};

/**
 * Kolom fitur baru di tabel products — ditambahkan lewat migrasi SQL:
 *   maintenance, maintenance_note  → supabase/migrations/2026-11-product-maintenance.sql
 *   pinned, sold_offset, show_sold, bestseller_mode → supabase/migrations/2026-11-product-pin-sold.sql
 * Kalau migrasi belum dijalankan, query yang menyertakan kolom itu ditolak Supabase. Helper di bawah
 * mendeteksi kasus itu supaya simpan produk biasa TETAP berhasil (tanpa fitur barunya).
 */
const OPTIONAL_COLS = ['maintenance', 'maintenance_note', 'pinned', 'sold_offset', 'show_sold', 'bestseller_mode'] as const;
const OPTIONAL_DEFAULTS: Record<(typeof OPTIONAL_COLS)[number], unknown> = {
    maintenance: false, maintenance_note: null, pinned: false, sold_offset: 0, show_sold: true, bestseller_mode: 'auto',
};

export const NEW_COLUMNS_WARNING =
    'Kolom fitur baru (maintenance / pin / terjual) belum ada di database. Jalankan file di supabase/migrations/ (2026-11-product-maintenance.sql dan 2026-11-product-pin-sold.sql) di Supabase SQL Editor, lalu simpan lagi. Perubahan lain sudah tersimpan.';

function isMissingOptionalColumn(err: any): boolean {
    if (!err) return false;
    const msg = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`.toLowerCase();
    if (!OPTIONAL_COLS.some((c) => msg.includes(c))) return false;
    return err.code === 'PGRST204' || err.code === '42703' || msg.includes('column') || msg.includes('schema cache');
}

function withoutOptionalCols<T extends Record<string, any>>(payload: T): Record<string, any> {
    const out: Record<string, any> = { ...payload };
    for (const c of OPTIONAL_COLS) delete out[c];
    return out;
}

const optVal = (obj: any, k: (typeof OPTIONAL_COLS)[number]) => {
    const v = obj?.[k];
    return String(v === undefined || v === null || v === '' ? OPTIONAL_DEFAULTS[k] : v);
};
/** true bila ada kolom fitur baru yang nilainya BUKAN bawaan (artinya perlu kolomnya ada di DB). */
const hasNonDefaultOptional = (obj: any) => OPTIONAL_COLS.some((k) => optVal(obj, k) !== String(OPTIONAL_DEFAULTS[k]));
/** true bila ada kolom fitur baru yang berubah dibanding produk sebelumnya. */
const changedOptional = (next: any, prev: any) => OPTIONAL_COLS.some((k) => k in next && optVal(next, k) !== optVal(prev, k));

/** Rapikan input fitur baru dari form admin (tipe & batas aman). Hanya field yang dikirim yang diproses. */
function normalizeOptional(src: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    if (src.maintenance !== undefined) out.maintenance = Boolean(src.maintenance);
    if (src.maintenance_note !== undefined) out.maintenance_note = src.maintenance_note ? String(src.maintenance_note).trim().slice(0, 300) || null : null;
    if (src.pinned !== undefined) out.pinned = Boolean(src.pinned);
    if (src.show_sold !== undefined) out.show_sold = Boolean(src.show_sold);
    if (src.sold_offset !== undefined) out.sold_offset = Math.max(0, Math.min(1_000_000, Math.floor(Number(src.sold_offset)) || 0));
    if (src.bestseller_mode !== undefined) out.bestseller_mode = ['auto', 'on', 'off'].includes(src.bestseller_mode) ? src.bestseller_mode : 'auto';
    return out;
}

/**
 * Dapatkan semua produk dan SKU/Stok langsung dari Supabase sebagai Database Utama
 */
async function loadAllProducts(includeInactive: boolean = false): Promise<Product[]> {
    const client = getSupabaseAdmin() || getSupabase();
    if (client) {
        try {
            let query = client.from('products').select('*').order('sort_order', { ascending: true });
            if (!includeInactive) {
                query = query.eq('is_active', true);
            }
            const { data: prods, error } = await query;
            if (!error && prods && prods.length > 0) {
                let itemsQuery = client.from('product_items').select('*').order('sort_order', { ascending: true });
                if (!includeInactive) {
                    itemsQuery = itemsQuery.eq('is_active', true);
                }
                const { data: items, error: itemsErr } = await itemsQuery;
                if (itemsErr) {
                    console.warn('Gagal ambil product_items dari Supabase:', itemsErr);
                }

                const fullProducts: Product[] = prods.map((p: any) => {
                    const rawItems = items ? items.filter((i: any) => i.product_slug === p.slug) : [];
                    const formattedItems: ProductItem[] = rawItems.map((it: any) => {
                        const stockVal = it.stock !== null && it.stock !== undefined ? Number(it.stock) : 999;
                        const inStockVal = it.in_stock !== null && it.in_stock !== undefined ? Boolean(it.in_stock) : stockVal > 0;
                        return {
                            id: String(it.id),
                            product_slug: it.product_slug,
                            sku: it.sku,
                            name: it.name,
                            price: Number(it.price),
                            original_price: Number(it.original_price || it.price),
                            cost_usd: it.cost_usd || undefined,
                            badge: it.badge || '',
                            icon_url: it.icon_url || '',
                            is_active: it.is_active !== undefined ? Boolean(it.is_active) : true,
                            sort_order: Number(it.sort_order || 0),
                            stock: stockVal,
                            in_stock: inStockVal,
                        };
                    });

                    return {
                        ...p,
                        items: formattedItems,
                    };
                });

                // Catatan: JANGAN bust('products:') di sini. Loader ini berjalan di dalam memo(); bust akan menghapus cache
                // key LAIN (publik <-> admin) sehingga keduanya saling memaksa query ulang ke Supabase.
                globalForProducts.cachedProducts = fullProducts;
                return fullProducts;
            }
        } catch (e) {
            console.warn('Supabase query failed, using memory fallback:', e);
        }
    }

    // Fallback jika database Supabase sedang offline
    const list = globalForProducts.cachedProducts || INITIAL_PRODUCTS;
    return includeInactive ? list : list.filter((p) => p.is_active);
}

/**
 * Katalog di-cache di memori: 2 menit untuk publik, 20 detik untuk admin.
 * Mengurangi 2 query Supabase per kunjungan menjadi ~2 query per 2 menit per instance.
 */
export async function getAllProducts(includeInactive: boolean = false): Promise<Product[]> {
    return memo(includeInactive ? 'products:all' : 'products:active', includeInactive ? 20_000 : 120_000, () => loadAllProducts(includeInactive));
}

/**
 * Ambil produk berdasarkan slug langsung dari Supabase
 */
export async function getProductBySlug(slug: string): Promise<Product | null> {
    const all = await getAllProducts(true);
    const prod = all.find((p) => p.slug === slug);
    return prod || null;
}

/**
 * Dapatkan URL gambar produk yang optimal (mencocokkan asset lokal dari referensi site jika sesuai)
 */
export function getProductImage(product?: { name?: string; slug?: string; icon_url?: string } | null): string {
    if (!product) return '/images/aimhack.jpg';

    const slug = (product.slug || '').toLowerCase();
    const name = (product.name || '').toLowerCase();

    if (slug.includes('aim-hack') || slug.includes('aimhack') || name.includes('aim hack') || name.includes('aimhack')) return '/images/aimhack.jpg';
    if (slug.includes('abcd') || name.includes('abcd')) return '/images/abcd.jpg';
    if (slug.includes('fluorite') || name.includes('fluorite')) return '/images/fluorite.jpg';
    if (slug.includes('angry') || name.includes('angry')) return '/images/angry.jpg';
    if (slug.includes('migul') || name.includes('migul')) return '/images/migul.jpg';
    if (slug.includes('silent') || name.includes('silent')) return '/images/silent.jpg';
    if (slug.includes('rapid') || name.includes('rapid')) return '/images/rapid.jpg';
    if (slug.includes('pato') || name.includes('pato')) return '/images/pato.jpg';
    if (slug.includes('br-mods') || slug.includes('brmods') || name.includes('br mod') || name.includes('brmods')) return '/images/br-mods.jpg';
    if (slug.includes('hg') || name.includes('hg cheat') || name.includes('hg')) return '/images/hg.jpg';
    if (slug.includes('gbox') || name.includes('gbox')) return '/images/gbox.png';
    if (slug.includes('xreg') || name.includes('xreg')) return '/images/xreg.png';
    if (slug.includes('drip') || name.includes('drip')) return '/images/drip.jpg';

    if (product.icon_url && product.icon_url.trim() !== '') {
        return product.icon_url;
    }

    return '/images/aimhack.jpg';
}

/**
 * Tambah produk baru langsung ke Supabase
 */
export async function createProduct(newProdData: Partial<Product>): Promise<Product> {
    const all = await getAllProducts(true);

    const slug = (newProdData.slug || newProdData.name || 'product')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    // Cek duplikasi slug
    let finalSlug = slug;
    let counter = 1;
    while (all.some((p) => p.slug === finalSlug)) {
        finalSlug = `${slug}-${counter++}`;
    }

    const newProduct: Product = {
        id: `prod-${Date.now()}`,
        slug: finalSlug,
        name: newProdData.name || 'Produk Baru',
        publisher: newProdData.publisher || 'Developer',
        category_slug: newProdData.category_slug || 'games',
        icon_url: newProdData.icon_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&q=80',
        banner_url: newProdData.banner_url || '',
        description: newProdData.description || '',
        badge: newProdData.badge || 'BARU',
        input_label_1: newProdData.input_label_1 || 'User ID',
        input_placeholder_1: newProdData.input_placeholder_1 || 'Masukkan User ID',
        input_label_2: newProdData.input_label_2,
        input_placeholder_2: newProdData.input_placeholder_2,
        has_zone_id: Boolean(newProdData.has_zone_id),
        is_active: newProdData.is_active !== undefined ? newProdData.is_active : true,
        is_featured: newProdData.is_featured !== undefined ? newProdData.is_featured : true,
        maintenance: false,
        maintenance_note: null,
        pinned: false,
        sold_offset: 0,
        show_sold: true,
        bestseller_mode: 'auto',
        ...normalizeOptional(newProdData),
        sort_order: newProdData.sort_order || all.length + 1,
        items: newProdData.items || [],
    };

    // 1. Simpan ke Supabase
    const client = getSupabaseAdmin() || getSupabase();
    if (client) {
        try {
            const { items, id, _warning, sold_real, ...fullPayload } = newProduct as Product & { sold_real?: number };
            // Produk baru yang semua fitur barunya masih bawaan tidak perlu mengirim kolom-kolom itu sama sekali
            const prodPayload: Record<string, any> = hasNonDefaultOptional(newProduct) ? fullPayload : withoutOptionalCols(fullPayload);
            let { data, error } = await client.from('products').insert([prodPayload]).select();
            if (error && isMissingOptionalColumn(error)) {
                ({ data, error } = await client.from('products').insert([withoutOptionalCols(prodPayload)]).select());
                if (hasNonDefaultOptional(newProduct)) {
                    Object.assign(newProduct, OPTIONAL_DEFAULTS);
                    newProduct._warning = NEW_COLUMNS_WARNING;
                }
            }
            if (!error && data && data[0]) {
                newProduct.id = data[0].id;
            } else if (error) {
                console.warn('Gagal insert product ke Supabase:', error);
            }
            if (items && items.length > 0) {
                const cleanItems = items.map(({ id, ...i }) => ({
                    ...i,
                    product_slug: finalSlug,
                    stock: i.stock !== undefined ? Number(i.stock) : 999,
                    in_stock: i.in_stock !== undefined ? Boolean(i.in_stock) : true,
                }));
                await client.from('product_items').insert(cleanItems);
            }
        } catch (e) {
            console.warn('Gagal insert product baru ke Supabase:', e);
        }
    }

    // Jangan simpan penanda peringatan ke cache; cukup dikembalikan ke pemanggil
    const { _warning: createWarning, ...storedProduct } = newProduct;
    all.push(storedProduct);
    globalForProducts.cachedProducts = all; bust('products:');

    return createWarning ? { ...storedProduct, _warning: createWarning } : storedProduct;
}

/**
 * Edit produk yang sudah ada langsung di Supabase
 */
export async function updateProduct(slug: string, updates: Partial<Product>): Promise<Product | null> {
    const all = await getAllProducts(true);
    const index = all.findIndex((p) => p.slug === slug);
    if (index === -1) return null;

    const existing = all[index];

    // Rapikan input dari form admin; field transien (hanya untuk tampilan) tidak boleh ikut disimpan
    const cleanUpdates: Partial<Product> = { ...updates, ...normalizeOptional(updates) };
    delete cleanUpdates._warning;
    delete cleanUpdates.sold_real;

    const updated: Product = {
        ...existing,
        ...cleanUpdates,
        slug: existing.slug,
        items: cleanUpdates.items !== undefined ? cleanUpdates.items : existing.items,
    };

    // Update di Supabase
    const client = getSupabaseAdmin() || getSupabase();
    if (client) {
        try {
            const { items, id, _warning, sold_real, ...prodPayload } = updated as Product & { sold_real?: number };
            let { error: updErr } = await client.from('products').update(prodPayload).eq('slug', slug);
            if (updErr && isMissingOptionalColumn(updErr)) {
                // Migrasi belum dijalankan: simpan semua field lain, abaikan kolom fitur baru
                ({ error: updErr } = await client.from('products').update(withoutOptionalCols(prodPayload)).eq('slug', slug));
                if (changedOptional(cleanUpdates, existing)) updated._warning = NEW_COLUMNS_WARNING;
                for (const k of OPTIONAL_COLS) (updated as any)[k] = (existing as any)[k];
            }
            if (updErr) console.warn('Gagal update product di Supabase:', updErr);

            // CASCADE VISIBILITAS: kalau status publik/private produk berubah,
            // semua SKU di dalamnya harus ikut. Tanpa ini, SKU hasil sync Drip
            // (yang dibuat private) selamanya tertahan is_active = false -- produk
            // tampak "Publik" di admin, tapi katalog publik & RPC purchase_item
            // menganggap semua variannya habis/tidak tersedia walaupun stok ada.
            // Catatan: mengaktifkan ulang produk mengaktifkan SEMUA SKU-nya;
            // SKU yang sengaja dimatikan satuan harus dimatikan lagi manual.
            if (updates.is_active !== undefined && Boolean(updates.is_active) !== Boolean(existing.is_active)) {
                const itemActive = Boolean(updates.is_active);
                const { error: itemErr } = await client
                    .from('product_items')
                    .update({ is_active: itemActive })
                    .eq('product_slug', slug);
                if (itemErr) console.warn('Gagal cascade is_active ke product_items:', itemErr);
                updated.items = (updated.items || []).map((it) => ({ ...it, is_active: itemActive }));
            }
        } catch (e) {
            console.warn('Gagal update product di Supabase:', e);
        }
    }

    const { _warning: updateWarning, ...storedUpdated } = updated;
    all[index] = storedUpdated;
    globalForProducts.cachedProducts = all; bust('products:');

    return updateWarning ? { ...storedUpdated, _warning: updateWarning } : storedUpdated;
}

/**
 * Jumlah penjualan asli per produk (pesanan lunas). Dihitung di database lewat RPC product_sales_counts()
 * (1 query agregat) dan di-cache 5 menit per instance supaya tidak membebani Supabase gratisan.
 * Bila migrasi belum dijalankan / RPC error → kosong (fitur "terjual" tersembunyi, toko tetap jalan).
 */
export async function getProductSales(): Promise<Record<string, number>> {
    return memo('sales:main', 300_000, async () => {
        const client = getSupabaseAdmin() || getSupabase();
        if (!client) return {};
        try {
            const { data, error } = await client.rpc('product_sales_counts');
            if (error || !Array.isArray(data)) return {};
            const out: Record<string, number> = {};
            for (const r of data as any[]) out[String(r.product_slug)] = Number(r.sold) || 0;
            return out;
        } catch {
            return {};
        }
    });
}

/**
 * Hapus produk dari Supabase
 */
export async function deleteProduct(slug: string): Promise<boolean> {
    const all = await getAllProducts(true);
    const filtered = all.filter((p) => p.slug !== slug);
    if (filtered.length === all.length) return false;

    // Hapus di Supabase
    const client = getSupabaseAdmin() || getSupabase();
    if (client) {
        try {
            await client.from('product_items').delete().eq('product_slug', slug);
            await client.from('products').delete().eq('slug', slug);
        } catch (e) {
            console.warn('Gagal delete product di Supabase:', e);
        }
    }

    globalForProducts.cachedProducts = filtered; bust('products:');

    return true;
}

/**
 * Timpa semua produk dan SKU ke Supabase (digunakan untuk auto-sync Drip API catalog)
 * Menggunakan batch upsert untuk efisiensi jaringan & menghindari serverless timeout
 */
export async function overwriteAllProducts(products: Product[]): Promise<Product[]> {
    globalForProducts.cachedProducts = products; bust('products:');

    const client = getSupabaseAdmin() || getSupabase();
    if (client) {
        try {
            // 1. Batch upsert semua produk dalam 1 query
            const productsPayload = products.map((prod) => {
                const { items, id, ...prodPayload } = prod;
                return prodPayload;
            });
            if (productsPayload.length > 0) {
                const { error: prodErr } = await client.from('products').upsert(productsPayload, { onConflict: 'slug' });
                if (prodErr) console.warn('Gagal batch upsert products ke Supabase:', prodErr);
            }

            // 2. Kumpulkan seluruh SKU untuk batch upsert dalam chunk 50 item
            const allItems: any[] = [];
            for (const prod of products) {
                if (prod.items && prod.items.length > 0) {
                    for (const item of prod.items) {
                        const { id, ...itemPayload } = item;
                        allItems.push({
                            ...itemPayload,
                            product_slug: prod.slug,
                            stock: item.stock !== undefined ? Number(item.stock) : 999,
                            in_stock: item.in_stock !== undefined ? Boolean(item.in_stock) : true,
                        });
                    }
                }
            }

            const CHUNK_SIZE = 50;
            for (let i = 0; i < allItems.length; i += CHUNK_SIZE) {
                const chunk = allItems.slice(i, i + CHUNK_SIZE);
                const { error: itemErr } = await client.from('product_items').upsert(chunk, { onConflict: 'product_slug,sku' as any });
                if (itemErr) console.warn('Gagal batch upsert product_items chunk:', itemErr);
            }
        } catch (e) {
            console.warn('Gagal sync overwrite products ke Supabase:', e);
        }
    }

    return products;
}

/**
 * Tambah Item / SKU ke Produk langsung di Supabase
 */
export async function createProductItem(productSlug: string, itemData: Partial<ProductItem>): Promise<ProductItem | null> {
    const all = await getAllProducts(true);
    const prod = all.find((p) => p.slug === productSlug);
    if (!prod) return null;

    const finalSku = String(itemData.sku || `${productSlug.toUpperCase()}-${Date.now().toString().slice(-4)}`).trim();
    const finalName = String(itemData.name || 'Nominal Baru').trim();
    const finalPrice = Number(itemData.price || 10000);
    const finalOriginalPrice = Number(itemData.original_price || itemData.price || 10000);
    const finalBadge = itemData.badge !== undefined ? (itemData.badge ? String(itemData.badge).trim() : null) : null;
    const finalCostUsd = itemData.cost_usd !== undefined ? (itemData.cost_usd ? String(itemData.cost_usd).trim() : null) : null;
    const finalIconUrl = itemData.icon_url !== undefined ? (itemData.icon_url ? String(itemData.icon_url).trim() : null) : null;
    const finalIsActive = itemData.is_active !== undefined ? Boolean(itemData.is_active) : true;
    const finalSortOrder = Number(itemData.sort_order || (prod.items?.length || 0) + 1);
    const finalStock = itemData.stock !== undefined ? Number(itemData.stock) : 999;
    const finalInStock = itemData.in_stock !== undefined ? Boolean(itemData.in_stock) : finalStock > 0;

    const dbPayload = {
        product_slug: productSlug,
        sku: finalSku,
        name: finalName,
        price: finalPrice,
        original_price: finalOriginalPrice,
        cost_usd: finalCostUsd,
        badge: finalBadge,
        icon_url: finalIconUrl,
        is_active: finalIsActive,
        sort_order: finalSortOrder,
        stock: finalStock,
        in_stock: finalInStock,
    };

    let generatedId = `sku-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Sync langsung ke Supabase
    const client = getSupabaseAdmin() || getSupabase();
    if (client) {
        try {
            const { data, error } = await client
                .from('product_items')
                .upsert(dbPayload, { onConflict: 'product_slug,sku' })
                .select();
            if (!error && data && data[0]) {
                generatedId = data[0].id;
            } else if (error) {
                console.warn('Gagal create product_item di Supabase:', error);
            }
        } catch (e) {
            console.warn('Gagal sync product_item ke Supabase:', e);
        }
    }

    const newItem: ProductItem = {
        id: generatedId,
        product_slug: productSlug,
        sku: finalSku,
        name: finalName,
        price: finalPrice,
        original_price: finalOriginalPrice,
        cost_usd: finalCostUsd || undefined,
        badge: finalBadge || '',
        icon_url: finalIconUrl || '',
        is_active: finalIsActive,
        sort_order: finalSortOrder,
        stock: finalStock,
        in_stock: finalInStock,
    };

    if (!prod.items) prod.items = [];
    prod.items.push(newItem);

    globalForProducts.cachedProducts = all; bust('products:');

    return newItem;
}

/**
 * Update Item / SKU & Stok langsung di Supabase
 */
export async function updateProductItem(productSlug: string, itemId: string, itemUpdates: Partial<ProductItem>): Promise<ProductItem | null> {
    const all = await getAllProducts(true);
    const prod = all.find((p) => p.slug === productSlug);
    if (!prod || !prod.items) return null;

    const itemIndex = prod.items.findIndex((i) => i.id === itemId || i.sku === itemId);
    if (itemIndex === -1) return null;

    const existing = prod.items[itemIndex];

    const finalPrice = itemUpdates.price !== undefined ? Number(itemUpdates.price) : Number(existing.price || 0);
    const finalOriginalPrice = itemUpdates.original_price !== undefined
        ? Number(itemUpdates.original_price)
        : Number(existing.original_price || finalPrice);
    const finalSku = itemUpdates.sku ? String(itemUpdates.sku).trim() : existing.sku;
    const finalName = itemUpdates.name ? String(itemUpdates.name).trim() : existing.name;
    const finalBadge = itemUpdates.badge !== undefined ? (itemUpdates.badge ? String(itemUpdates.badge).trim() : null) : (existing.badge || null);
    const finalCostUsd = itemUpdates.cost_usd !== undefined ? (itemUpdates.cost_usd ? String(itemUpdates.cost_usd).trim() : null) : (existing.cost_usd || null);
    const finalIconUrl = itemUpdates.icon_url !== undefined ? (itemUpdates.icon_url ? String(itemUpdates.icon_url).trim() : null) : (existing.icon_url || null);
    const finalIsActive = itemUpdates.is_active !== undefined ? Boolean(itemUpdates.is_active) : (existing.is_active !== undefined ? existing.is_active : true);
    const finalSortOrder = itemUpdates.sort_order !== undefined ? Number(itemUpdates.sort_order) : Number(existing.sort_order || 1);
    const finalStock = itemUpdates.stock !== undefined ? Number(itemUpdates.stock) : (existing.stock !== undefined ? Number(existing.stock) : 999);
    const finalInStock = itemUpdates.in_stock !== undefined ? Boolean(itemUpdates.in_stock) : finalStock > 0;

    const updatedItem: ProductItem = {
        id: existing.id,
        product_slug: productSlug,
        sku: finalSku,
        name: finalName,
        price: finalPrice,
        original_price: finalOriginalPrice,
        cost_usd: finalCostUsd || undefined,
        badge: finalBadge || '',
        icon_url: finalIconUrl || '',
        is_active: finalIsActive,
        sort_order: finalSortOrder,
        stock: finalStock,
        in_stock: finalInStock,
    };

    const dbPayload = {
        product_slug: productSlug,
        sku: finalSku,
        name: finalName,
        price: finalPrice,
        original_price: finalOriginalPrice,
        cost_usd: finalCostUsd,
        badge: finalBadge,
        icon_url: finalIconUrl,
        is_active: finalIsActive,
        sort_order: finalSortOrder,
        stock: finalStock,
        in_stock: finalInStock,
    };

    // Langsung update ke Supabase sebagai Database Utama
    const client = getSupabaseAdmin() || getSupabase();
    if (client) {
        try {
            let updatedInDb = false;
            const isUuid = existing.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existing.id);

            // 1. Coba update via UUID jika ID adalah UUID
            if (isUuid) {
                const { data, error } = await client
                    .from('product_items')
                    .update(dbPayload)
                    .eq('id', existing.id)
                    .select();
                if (!error && data && data.length > 0) {
                    updatedInDb = true;
                    updatedItem.id = data[0].id;
                } else if (error) {
                    console.warn('Supabase update product_item by id error:', error);
                }
            }

            // 2. Jika belum terupdate via UUID, coba via product_slug dan sku lama
            if (!updatedInDb) {
                const { data, error } = await client
                    .from('product_items')
                    .update(dbPayload)
                    .eq('product_slug', productSlug)
                    .eq('sku', existing.sku)
                    .select();
                if (!error && data && data.length > 0) {
                    updatedInDb = true;
                    updatedItem.id = data[0].id;
                } else if (error) {
                    console.warn('Supabase update product_item by sku error:', error);
                }
            }

            // 3. Jika belum ada di Supabase, lakukan upsert
            if (!updatedInDb) {
                const { data, error } = await client
                    .from('product_items')
                    .upsert(dbPayload, { onConflict: 'product_slug,sku' })
                    .select();
                if (!error && data && data[0]) {
                    updatedItem.id = data[0].id;
                    updatedInDb = true;
                } else if (error) {
                    console.warn('Supabase upsert product_item error:', error);
                }
            }
        } catch (e) {
            console.warn('Gagal sync update product_item ke Supabase:', e);
        }
    }

    prod.items[itemIndex] = updatedItem;
    globalForProducts.cachedProducts = all; bust('products:');

    return updatedItem;
}

/**
 * Hapus Item / SKU dari Supabase
 */
export async function deleteProductItem(productSlug: string, itemId: string): Promise<boolean> {
    const all = await getAllProducts(true);
    const prod = all.find((p) => p.slug === productSlug);
    if (!prod || !prod.items) return false;

    const itemToDelete = prod.items.find((i) => i.id === itemId || i.sku === itemId);
    const lenBefore = prod.items.length;
    prod.items = prod.items.filter((i) => i.id !== itemId && i.sku !== itemId);
    if (prod.items.length === lenBefore) return false;

    // Hapus di Supabase
    const client = getSupabaseAdmin() || getSupabase();
    if (client) {
        try {
            const isUuid = itemToDelete?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemToDelete.id);
            if (isUuid) {
                await client.from('product_items').delete().eq('id', itemToDelete.id);
            }
            if (itemToDelete?.sku) {
                await client.from('product_items').delete().eq('product_slug', productSlug).eq('sku', itemToDelete.sku);
            }
        } catch (e) {
            console.warn('Gagal delete product_item di Supabase:', e);
        }
    }

    globalForProducts.cachedProducts = all; bust('products:');

    return true;
}

/**
 * Kurangi stok item / SKU setelah order berhasil terbayar
 */
export async function decrementProductItemStock(productSlug: string, sku: string, qty: number = 1): Promise<void> {
    const client = getSupabaseAdmin() || getSupabase();
    if (client) {
        try {
            const { data } = await client
                .from('product_items')
                .select('id, stock')
                .eq('product_slug', productSlug)
                .eq('sku', sku)
                .single();

            if (data) {
                const currentStock = data.stock !== null && data.stock !== undefined ? Number(data.stock) : 999;
                const newStock = Math.max(0, currentStock - qty);
                await client
                    .from('product_items')
                    .update({ stock: newStock, in_stock: newStock > 0 })
                    .eq('id', data.id);
                bust('products:');
            }
        } catch (e) {
            console.warn('Gagal decrement stock di Supabase:', e);
        }
    }
}

export interface BulkPricingParams {
    targetSlugs?: string[]; // Array slug produk, jika kosong atau berisi 'ALL' maka semua produk
    markupType: 'fixed' | 'percent'; // 'fixed' = nominal untung Rp (misal Rp 1.000), 'percent' = persentase untung (misal 25%)
    markupValue: number; // Nilai keuntungan (misal 1000 atau 25)
    usdRate?: number; // Kurs USD ke IDR, default 16000
    rounding?: number; // Pembulatan harga (1000, 500, 100, atau 0 untuk tanpa pembulatan)
    updateOriginalPrice?: boolean; // Update harga coret promo
    originalPricePercent?: number; // Persentase harga coret di atas harga jual (default 25%)
    preview?: boolean; // Jika true, hanya kalkulasi pratinjau tanpa menyimpan ke database
}

export interface BulkPricingResult {
    success: boolean;
    updatedProductsCount: number;
    updatedItemsCount: number;
    previewItems: Array<{
        productSlug: string;
        productName: string;
        itemSku: string;
        itemName: string;
        costUsd?: string;
        costIdr: number;
        oldPrice: number;
        newPrice: number;
        oldOriginalPrice: number;
        newOriginalPrice: number;
        profit: number;
    }>;
    message?: string;
}

/**
 * Atur Keuntungan & Markup Harga Secara Massal (Bulk Pricing)
 */
export async function bulkUpdatePricing(params: BulkPricingParams): Promise<BulkPricingResult> {
    const all = await getAllProducts(true);
    const usdRate = Number(params.usdRate) || 16000;
    const markupValue = Number(params.markupValue) || 0;
    const markupType = params.markupType || 'fixed';
    const rounding = params.rounding !== undefined ? Number(params.rounding) : 1000;
    const updateOriginalPrice = params.updateOriginalPrice !== false;
    const originalPricePercent = Number(params.originalPricePercent) || 25;
    const isPreview = Boolean(params.preview);

    const isAll = !params.targetSlugs || params.targetSlugs.length === 0 || params.targetSlugs.includes('ALL');
    const targetSet = new Set(params.targetSlugs || []);

    const updatedItemsForDb: Array<{ product_slug: string; sku: string; price: number; original_price: number }> = [];
    const previewItems: BulkPricingResult['previewItems'] = [];
    let updatedProductsCount = 0;
    let updatedItemsCount = 0;

    for (const prod of all) {
        if (!isAll && !targetSet.has(prod.slug)) {
            continue;
        }

        if (!prod.items || prod.items.length === 0) {
            continue;
        }

        let prodHasChanges = false;

        for (const item of prod.items) {
            const hasUsdCost = item.cost_usd && parseFloat(item.cost_usd) > 0;
            const costIdr = hasUsdCost
                ? Math.round(parseFloat(item.cost_usd!) * usdRate)
                : Number(item.price); // Untuk item game tanpa cost_usd, gunakan harga saat ini sebagai basis

            let rawNewPrice = 0;
            if (markupType === 'fixed') {
                rawNewPrice = costIdr + markupValue;
            } else {
                rawNewPrice = costIdr * (1 + markupValue / 100);
            }

            // Pembulatan harga jual
            let newPrice = 0;
            if (rounding > 0) {
                newPrice = Math.max(1000, Math.round(rawNewPrice / rounding) * rounding);
            } else {
                newPrice = Math.max(1000, Math.round(rawNewPrice));
            }

            // Harga coret promo
            let newOriginalPrice = item.original_price;
            if (updateOriginalPrice) {
                const markupOrig = newPrice * (1 + originalPricePercent / 100);
                newOriginalPrice = Math.max(newPrice + 1000, Math.round(markupOrig / 1000) * 1000);
            }

            const profit = newPrice - (hasUsdCost ? costIdr : 0);

            previewItems.push({
                productSlug: prod.slug,
                productName: prod.name,
                itemSku: item.sku,
                itemName: item.name,
                costUsd: item.cost_usd,
                costIdr,
                oldPrice: item.price,
                newPrice,
                oldOriginalPrice: item.original_price,
                newOriginalPrice,
                profit,
            });

            if (!isPreview) {
                item.price = newPrice;
                item.original_price = newOriginalPrice;
                updatedItemsForDb.push({
                    product_slug: prod.slug,
                    sku: item.sku,
                    price: newPrice,
                    original_price: newOriginalPrice,
                });
            }

            prodHasChanges = true;
            updatedItemsCount++;
        }

        if (prodHasChanges) {
            updatedProductsCount++;
        }
    }

    if (!isPreview) {
        // Simpan ke memory cache
        globalForProducts.cachedProducts = all; bust('products:');

        // Batch update ke Supabase
        const client = getSupabaseAdmin() || getSupabase();
        if (client && updatedItemsForDb.length > 0) {
            try {
                const CHUNK_SIZE = 25;
                for (let i = 0; i < updatedItemsForDb.length; i += CHUNK_SIZE) {
                    const chunk = updatedItemsForDb.slice(i, i + CHUNK_SIZE);
                    await Promise.all(
                        chunk.map((it) =>
                            client
                                .from('product_items')
                                .update({ price: it.price, original_price: it.original_price })
                                .eq('product_slug', it.product_slug)
                                .eq('sku', it.sku)
                        )
                    );
                }
            } catch (e) {
                console.warn('Gagal batch update bulk pricing di Supabase:', e);
            }
        }
    }

    return {
        success: true,
        updatedProductsCount,
        updatedItemsCount,
        previewItems: previewItems.slice(0, 30), // Kirim 30 sampel untuk preview UI
        message: isPreview
            ? `Simulasi selesai: ${updatedItemsCount} SKU pada ${updatedProductsCount} produk akan diperbarui.`
            : `Berhasil memperbarui harga ${updatedItemsCount} SKU pada ${updatedProductsCount} produk!`,
    };
}
