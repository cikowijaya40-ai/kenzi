import crypto from 'crypto';
import { requireDb } from './supabase';
import { bust, memo } from './cache';
import { hashPassword, rateLimit, sha256, validatePasswordStrength } from './security';
import { EMAIL_RE, USERNAME_RE, sanitizeText } from './users';
import { adminAdjust, listLedger } from './wallet';
import { judgeLive, thBuy, thLiveMap, thVariantId } from './thanhub';
import type { AppUser } from './types';

/**
 * OPEN RESELLER + RESELLER API v1.
 * Pola mengikuti toko ini: Supabase (service role), saldo hanya berubah lewat fungsi SQL atomik,
 * key lisensi dibeli live dari Thanhub (satu unit satu ref idempoten).
 * SQL-nya ada di supabase/migrations/2026-11-open-reseller.sql.
 */

export const API_MAX_QTY = 20;
export const API_RATE_RPM = 120;
export const CURRENCY = 'IDR';

const rid = () => Math.random().toString(36).slice(2, 7).toUpperCase();
const stampNow = () => Date.now().toString().slice(-8);

/* ═════════ PENGATURAN & HARGA: lihat resellerPrice.ts (dipakai juga oleh wallet.ts / checkout.ts) ═════════ */
export { getResellerConfig, resellerPriceOf, resellerUnitPrice, isEligible, type ResellerConfig } from './resellerPrice';
import { getResellerConfig, isEligible, resellerPriceOf, resellerUnitPrice, type ResellerConfig } from './resellerPrice';

/* ═════════ SKU ═════════ */

export type DurUnit = 'd' | 'h' | 'm';
export const SKU_RE = /^([a-z0-9][a-z0-9_-]{0,99})\.(\d{1,5})([dhm])$/;

/** Baca durasi dari nama opsi ("30 Hari", "3 Jam", "Lifetime", ...). null = tidak terbaca. */
export function parseDuration(name: string): { n: number; unit: DurUnit } | null {
    const s = String(name || '').toLowerCase();
    if (/\b(lifetime|permanen|permanent|selamanya|seumur hidup)\b/.test(s)) return { n: 36500, unit: 'd' };
    const rules: Array<[RegExp, number, DurUnit]> = [
        [/(\d{1,5})\s*(?:hari|days?|d)(?![a-z])/, 1, 'd'],
        [/(\d{1,5})\s*(?:jam|hours?|hrs?|h)(?![a-z])/, 1, 'h'],
        [/(\d{1,5})\s*(?:menit|minutes?|mins?|m)(?![a-z])/, 1, 'm'],
        [/(\d{1,5})\s*(?:minggu|weeks?|w)(?![a-z])/, 7, 'd'],
        [/(\d{1,5})\s*(?:bulan|bln|months?)(?![a-z])/, 30, 'd'],
        [/(\d{1,5})\s*(?:tahun|years?)(?![a-z])/, 365, 'd'],
    ];
    for (const [re, mul, unit] of rules) {
        const m = s.match(re);
        if (m) {
            const n = Number(m[1]) * mul;
            if (n >= 1 && n <= 99999) return { n, unit };
        }
    }
    return null;
}

interface RawProduct { slug: string; name: string; category_slug: string | null; maintenance: boolean }
interface RawItem { id: string; product_slug: string; sku: string; name: string; price: number; reseller_price: number | null; in_stock: boolean; stock: number; sort_order: number }

export interface ApiRow {
    apiCode: string;
    productSlug: string;
    product: string;
    category: string;
    itemId: string;
    itemSku: string;       // ID varian di provider (TIDAK pernah dikirim ke reseller)
    label: string;
    n: number;
    unit: DurUnit;
    publicPrice: number;
    resellerOverride: number | null;
    maintenance: boolean;
    localInStock: boolean;
}
export interface ExcludedRow { productSlug: string; product: string; itemId: string; label: string; reason: string }

/** Murni (mudah dites): ubah produk + opsinya menjadi baris katalog API. Duplikat durasi / nama tak terbaca dikeluarkan. */
export function buildRows(prod: RawProduct, items: RawItem[]): { rows: ApiRow[]; excluded: ExcludedRow[] } {
    const rows: ApiRow[] = [];
    const excluded: ExcludedRow[] = [];
    const seen = new Set<string>();
    const slug = String(prod.slug || '').toLowerCase();
    // urutan deterministik: kalau dua opsi menghasilkan kode yang sama, yang urutannya lebih awal yang dipakai
    const sorted = [...items].sort((a, b) => (a.sort_order - b.sort_order) || String(a.sku).localeCompare(String(b.sku)));
    for (const it of sorted) {
        const ex = (reason: string) => excluded.push({ productSlug: prod.slug, product: prod.name, itemId: it.id, label: it.name, reason });
        if (!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(slug)) { ex('slug produk tidak valid untuk kode API'); continue; }
        const d = parseDuration(it.name);
        if (!d) { ex('durasi tidak terbaca dari nama (contoh nama yang terbaca: "30 Hari", "3 Jam")'); continue; }
        const code = `${slug}.${d.n}${d.unit}`;
        if (seen.has(code)) { ex(`kode ${code} sudah dipakai opsi lain di produk ini`); continue; }
        seen.add(code);
        const stock = it.stock === null || it.stock === undefined ? 999 : Number(it.stock);
        rows.push({
            apiCode: code, productSlug: prod.slug, product: prod.name, category: prod.category_slug || '',
            itemId: it.id, itemSku: it.sku, label: it.name, n: d.n, unit: d.unit,
            publicPrice: Math.round(Number(it.price)), resellerOverride: it.reseller_price === null || it.reseller_price === undefined ? null : Number(it.reseller_price),
            maintenance: prod.maintenance === true, localInStock: it.in_stock !== false && stock > 0,
        });
    }
    return { rows, excluded };
}

const normItem = (i: any): RawItem => ({
    id: String(i.id), product_slug: i.product_slug, sku: i.sku, name: i.name, price: Number(i.price),
    reseller_price: i.reseller_price === null || i.reseller_price === undefined ? null : Number(i.reseller_price),
    in_stock: i.in_stock !== false, stock: i.stock === null || i.stock === undefined ? 999 : Number(i.stock), sort_order: Number(i.sort_order || 0),
});
const normProd = (p: any): RawProduct => ({ slug: p.slug, name: p.name, category_slug: p.category_slug, maintenance: p.maintenance === true });

/** Seluruh katalog API (produk aktif + opsi aktif). Cache 15 dtk; admin mengubah harga → bust('rsl:'). */
async function loadCatalogRows(): Promise<{ rows: ApiRow[]; excluded: ExcludedRow[] }> {
    return memo('rsl:catalog', 15_000, async () => {
        const db = requireDb();
        const [p, i] = await Promise.all([
            db.from('products').select('slug, name, category_slug, maintenance, sort_order').eq('is_active', true).order('sort_order', { ascending: true }).range(0, 999),
            db.from('product_items').select('id, product_slug, sku, name, price, reseller_price, in_stock, stock, sort_order').or('is_active.is.null,is_active.eq.true').order('sort_order', { ascending: true }).range(0, 4999),
        ]);
        if (p.error) throw new Error(p.error.message);
        if (i.error) throw new Error(i.error.message);
        const byProd = new Map<string, RawItem[]>();
        for (const it of i.data || []) {
            const x = normItem(it);
            if (!byProd.has(x.product_slug)) byProd.set(x.product_slug, []);
            byProd.get(x.product_slug)!.push(x);
        }
        const rows: ApiRow[] = [];
        const excluded: ExcludedRow[] = [];
        for (const pr of p.data || []) {
            const r = buildRows(normProd(pr), byProd.get(pr.slug) || []);
            rows.push(...r.rows);
            excluded.push(...r.excluded);
        }
        return { rows, excluded };
    });
}

/** Cari 1 SKU dengan data SEGAR dari database (dipakai jalur order dan /stock; tidak lewat cache). */
export async function resolveSku(code: string): Promise<ApiRow | null> {
    const m = SKU_RE.exec(String(code || '').trim().toLowerCase());
    if (!m) return null;
    const slug = m[1];
    const db = requireDb();
    const { data: pr } = await db.from('products').select('slug, name, category_slug, maintenance').eq('is_active', true).ilike('slug', slug.replace(/[%_\\]/g, (c) => '\\' + c)).maybeSingle();
    if (!pr) return null;
    const { data: its } = await db.from('product_items').select('id, product_slug, sku, name, price, reseller_price, in_stock, stock, sort_order').eq('product_slug', pr.slug).or('is_active.is.null,is_active.eq.true');
    const { rows } = buildRows(normProd(pr), (its || []).map(normItem));
    return rows.find((r) => r.apiCode === `${slug}.${m[2]}${m[3]}`) || null;
}

export interface ApiProductItem {
    apiCode: string; name: string; product: string; productApiCode: string; category: string; label: string;
    days: number; unit: DurUnit; price: number; currency: string; stock: number | null; inStock: boolean; is_maintenance: boolean;
}

/** stock = null karena stok key hidup di provider (live). inStock sudah memperhitungkan stok live. */
export async function buildApiProducts(cfg: ResellerConfig): Promise<ApiProductItem[]> {
    const [{ rows }, live] = await Promise.all([loadCatalogRows(), thLiveMap().catch(() => null)]);
    return rows.map((r) => {
        const price = resellerUnitPrice(cfg, r.productSlug, { price: r.publicPrice, reseller_price: r.resellerOverride });
        const liveOk = live ? judgeLive(live.get(thVariantId(r.itemSku)), price).ok : true;
        return {
            apiCode: r.apiCode, name: `${r.product} - ${r.label}`, product: r.product, productApiCode: r.productSlug.toLowerCase(),
            category: r.category, label: r.label, days: r.n, unit: r.unit, price, currency: CURRENCY,
            stock: null, inStock: !r.maintenance && r.localInStock && price > 0 && liveOk, is_maintenance: r.maintenance,
        };
    });
}

export async function stockOf(row: ApiRow, cfg: ResellerConfig) {
    const price = resellerUnitPrice(cfg, row.productSlug, { price: row.publicPrice, reseller_price: row.resellerOverride });
    const live = await thLiveMap().catch(() => null);
    const liveOk = live ? judgeLive(live.get(thVariantId(row.itemSku)), price).ok : true;
    return { apiCode: row.apiCode, stock: null as number | null, inStock: !row.maintenance && row.localInStock && price > 0 && liveOk, is_maintenance: row.maintenance };
}

/* ═════════ API KEY ═════════ */
export const API_KEY_RE = /^rk_live_[a-f0-9]{48}$/;

export function newApiKey() {
    const key = 'rk_live_' + crypto.randomBytes(24).toString('hex');
    return { key, hash: sha256(key), prefix: key.slice(0, 12) + '…' + key.slice(-4) };
}

/** Buat / ganti key. Key lama langsung mati (hash ditimpa). Key utuh hanya dikembalikan di sini, tidak disimpan. */
export async function createApiKey(userId: string): Promise<{ ok: true; key: string; prefix: string } | { ok: false; message: string }> {
    const k = newApiKey();
    const { data, error } = await requireDb().from('users')
        .update({ api_key_hash: k.hash, api_key_prefix: k.prefix, api_key_created_at: new Date().toISOString() })
        .eq('id', userId).eq('is_reseller', true).eq('reseller_disabled', false).select('id');
    if (error) return { ok: false, message: 'Gagal membuat API key. Coba lagi.' };
    if (!data?.length) return { ok: false, message: 'Hanya reseller aktif yang bisa membuat API key.' };
    return { ok: true, key: k.key, prefix: k.prefix };
}

export async function revokeApiKey(userId: string): Promise<boolean> {
    const { error } = await requireDb().from('users').update({ api_key_hash: null, api_key_prefix: null, api_key_created_at: null }).eq('id', userId);
    return !error;
}

/* ═════════ DAFTAR RESELLER (sisi web) ═════════ */
export async function getResellerState(user: { id: string; balance: number }) {
    const [cfg, { data, error }] = await Promise.all([
        getResellerConfig(),
        requireDb().from('users').select('is_reseller, reseller_disabled, reseller_since, api_key_prefix, api_key_created_at').eq('id', user.id).maybeSingle(),
    ]);
    // ready=false: kolom reseller belum ada di database (migrasi belum diterapkan). Jangan pura-pura "bukan reseller".
    // Nama produk yang masuk program (untuk teks di portal); kosong bila berlaku untuk semua produk
    let names: string[] = [];
    if (cfg.scope === 'selected' && cfg.slugs.length) {
        const { data: pr } = await requireDb().from('products').select('slug, name').eq('is_active', true).in('slug', cfg.slugs);
        names = (pr || []).map((x: any) => x.name);
    }
    return {
        ready: !error,
        enabled: cfg.enabled, price: cfg.price, discount: cfg.discount, apiEnabled: cfg.apiEnabled,
        scope: cfg.scope, names,
        isReseller: Boolean(data?.is_reseller), disabled: Boolean(data?.reseller_disabled), since: data?.reseller_since || null,
        keyPrefix: data?.api_key_prefix || null, keyCreatedAt: data?.api_key_created_at || null,
        balance: Number(user.balance) || 0,      // sumber saldo = akun yang login, bukan hasil query di atas
    };
}

/* ═════════ PORTAL RESELLER (mirip portal Thanhub) ═════════ */
const wibStartOfDay = (now = Date.now()) => {
    const w = new Date(now + 7 * 3600_000);
    return Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) - 7 * 3600_000;   // 00:00 WIB
};

/** Katalog untuk tabel "Produk Kamu": semua opsi aktif, harga reseller + harga biasa + kode API (kalau namanya terbaca). */
async function portalCatalog(cfg: ResellerConfig) {
    const db = requireDb();
    const [p, i, live] = await Promise.all([
        db.from('products').select('slug, name, category_slug, maintenance, sort_order').eq('is_active', true).order('sort_order', { ascending: true }).range(0, 999),
        db.from('product_items').select('id, product_slug, sku, name, price, reseller_price, in_stock, stock, sort_order').or('is_active.is.null,is_active.eq.true').order('sort_order', { ascending: true }).range(0, 4999),
        thLiveMap().catch(() => null),
    ]);
    if (p.error) throw new Error(p.error.message);
    if (i.error) throw new Error(i.error.message);
    const byProd = new Map<string, RawItem[]>();
    for (const it of i.data || []) { const x = normItem(it); if (!byProd.has(x.product_slug)) byProd.set(x.product_slug, []); byProd.get(x.product_slug)!.push(x); }
    return (p.data || []).map((pr: any) => {
        const items = byProd.get(pr.slug) || [];
        const codes = new Map(buildRows(normProd(pr), items).rows.map((r) => [r.itemId, r.apiCode]));
        const maint = pr.maintenance === true;
        return {
            slug: pr.slug, name: pr.name, maintenance: maint,
            items: items.map((it) => {
                const price = resellerUnitPrice(cfg, pr.slug, { price: it.price, reseller_price: it.reseller_price });
                const liveOk = live ? judgeLive(live.get(thVariantId(it.sku)), price).ok : true;
                return {
                    sku: it.sku, label: it.name, apiCode: codes.get(it.id) || null, price, normal: Math.round(it.price),
                    inStock: !maint && it.in_stock && it.stock > 0 && price > 0 && liveOk,
                };
            }).sort((a, b) => a.price - b.price),
        };
    }).filter((x: any) => x.items.length);
}

/** Peringkat reseller berdasarkan total belanja (order selesai). Cache 60 detik. */
async function topSellersRaw(): Promise<{ id: string; name: string; qty: number; spent: number }[]> {
    return memo('rsl:top', 60_000, async () => {
        const db = requireDb();
        const { data: users } = await db.from('users').select('id, username').eq('is_reseller', true).eq('reseller_disabled', false).limit(2000);
        const ids = (users || []).map((u: any) => u.id);
        if (!ids.length) return [];
        const { data: ords } = await db.from('orders').select('user_id, quantity, total_amount').eq('delivery_status', 'DELIVERED').in('user_id', ids).limit(50000);
        const agg = new Map<string, { qty: number; spent: number }>();
        for (const o of ords || []) { const a = agg.get(o.user_id) || { qty: 0, spent: 0 }; a.qty += Math.max(1, Number(o.quantity) || 1); a.spent += Number(o.total_amount) || 0; agg.set(o.user_id, a); }
        const name = new Map((users || []).map((u: any) => [u.id, u.username]));
        return Array.from(agg.entries()).map(([id, a]) => ({ id, name: String(name.get(id) || 'Reseller'), ...a })).sort((x, y) => y.spent - x.spent).slice(0, 5);
    });
}

/**
 * Semua data untuk halaman portal /reseller dalam satu panggilan. Saldo SELALU dari akun yang login.
 * Hanya reseller aktif yang mendapat data (katalog, riwayat, mutasi, top seller); selain itu cukup statusnya.
 */
export async function getPortal(user: { id: string; username: string; email: string; balance: number }) {
    const state = await getResellerState(user);
    const base = { ...state, user: { username: user.username, email: user.email } };
    if (!state.ready || !state.isReseller || state.disabled) return { ...base, active: false as const };

    const db = requireDb();
    const cfg = await getResellerConfig();
    const [ords, ledger, catalog, top] = await Promise.all([
        db.from('orders').select('invoice_no, product_name, item_name, quantity, total_amount, status, delivery_status, source, created_at')
            .eq('user_id', user.id).neq('status', 'EXPIRED').order('created_at', { ascending: false }).limit(5000),
        listLedger(user.id, 50),
        portalCatalog(cfg),
        topSellersRaw(),
    ]);
    const all: any[] = ords.data || [];
    const startToday = wibStartOfDay();
    const since30 = Date.now() - 30 * 24 * 3600_000;
    const stats = { keys: 0, spent: 0, todayKeys: 0, todaySpent: 0, d30Keys: 0, d30Spent: 0 };
    for (const o of all) {
        if (o.delivery_status !== 'DELIVERED') continue;
        const q = Math.max(1, Number(o.quantity) || 1), amt = Number(o.total_amount) || 0, t = Date.parse(o.created_at) || 0;
        stats.keys += q; stats.spent += amt;
        if (t >= startToday) { stats.todayKeys += q; stats.todaySpent += amt; }
        if (t >= since30) { stats.d30Keys += q; stats.d30Spent += amt; }
    }
    return {
        ...base, active: true as const, discount: cfg.discount, stats,
        orders: all.slice(0, 50).map((o) => ({
            invoice: o.invoice_no, product: o.product_name, item: o.item_name, quantity: Math.max(1, Number(o.quantity) || 1),
            total: Number(o.total_amount) || 0, status: o.delivery_status === 'DELIVERED' ? 'OK' : o.status === 'FAILED' || o.delivery_status === 'FAILED' ? 'FAILED' : 'PENDING',
            via: o.source === 'api' ? 'API' : 'Web', createdAt: o.created_at,
        })),
        ledger, catalog,
        topSellers: top.map((t) => ({ name: t.name, qty: t.qty, spent: t.spent, me: t.id === user.id })),
    };
}

export async function joinReseller(user: AppUser): Promise<{ success: true; balance: number } | { success: false; code: string; message: string }> {
    const cfg = await getResellerConfig();
    if (!cfg.enabled) return { success: false, code: 'CLOSED', message: 'Pendaftaran reseller sedang ditutup.' };
    if (!(await getResellerState(user)).ready) return { success: false, code: 'NOT_READY', message: 'Fitur reseller belum aktif di server (database belum diperbarui). Hubungi admin.' };
    const invoice = `RSL-${stampNow()}-${rid()}`;
    const { data, error } = await requireDb().rpc('reseller_join', { p_user: user.id, p_fee: cfg.price, p_invoice: invoice });
    if (error) {
        const m = error.message || '';
        if (m.includes('ALREADY_RESELLER')) {
            const st = await getResellerState(user);
            return { success: false, code: 'ALREADY_RESELLER', message: st.disabled ? 'Akun reseller kamu sedang dinonaktifkan admin. Hubungi admin.' : 'Kamu sudah menjadi reseller.' };
        }
        if (m.includes('INSUFFICIENT_BALANCE')) return { success: false, code: 'INSUFFICIENT_BALANCE', message: `Saldo tidak cukup. Biaya bergabung Rp ${cfg.price.toLocaleString('id-ID')}, isi saldo dulu.` };
        if (m.includes('USER_INVALID')) return { success: false, code: 'USER_INVALID', message: 'Akun tidak valid.' };
        console.error('[reseller_join]', m);
        return { success: false, code: 'ERROR', message: 'Gagal memproses pendaftaran. Coba lagi.' };
    }
    return { success: true, balance: Number(data) };
}

/* ═════════ AUTH API ═════════ */
export interface ApiUser { id: string; username: string; email: string; balance: number; keyPrefix: string; keyHash: string }

export interface ApiFail { http: number; code: string; message: string; headers?: Record<string, string> }
export const apiFail = (http: number, code: string, message: string, headers?: Record<string, string>): ApiFail => ({ http, code, message, headers });

const clientIp = (req: Request) => (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown').split(',')[0].trim().slice(0, 64);

/** Bearer rk_live_... → user reseller aktif. 401 salah/kosong; 403 bukan reseller aktif / API dimatikan; 429 kena batas. */
export async function authenticateApi(req: Request): Promise<{ user: ApiUser } | { fail: ApiFail }> {
    const auth = req.headers.get('authorization') || '';
    const key = /^Bearer\s+(\S+)\s*$/i.exec(auth)?.[1] || '';
    const bad = async () => {
        // tebak-tebak key dibatasi per IP (hanya percobaan gagal yang dihitung)
        const rl = await rateLimit(`apiv1bad:${clientIp(req)}`, 60, 60).catch(() => ({ allowed: true, retryAfter: 0 }));
        if (!rl.allowed) return { fail: apiFail(429, 'BUSY', 'Terlalu banyak percobaan gagal. Coba lagi sebentar.', { 'Retry-After': String(rl.retryAfter || 60) }) };
        return { fail: apiFail(401, 'UNAUTHORIZED', 'API key kosong atau salah. Kirim header Authorization: Bearer rk_live_...') };
    };
    if (!API_KEY_RE.test(key)) return bad();

    const hash = sha256(key);
    const { data } = await requireDb().from('users')
        .select('id, username, email, balance, is_banned, is_reseller, reseller_disabled, api_key_prefix')
        .eq('api_key_hash', hash).maybeSingle();
    if (!data) return bad();

    const cfg = await getResellerConfig();
    if (data.is_banned || !data.is_reseller || data.reseller_disabled) return { fail: apiFail(403, 'FORBIDDEN', 'Akun ini bukan reseller aktif.') };
    if (!cfg.apiEnabled) return { fail: apiFail(403, 'FORBIDDEN', 'API reseller sedang dimatikan oleh admin.') };

    const rl = await rateLimit(`apiv1:${hash.slice(0, 24)}`, API_RATE_RPM, 60);
    if (!rl.allowed) return { fail: apiFail(429, 'BUSY', `Terlalu banyak request (maks ${API_RATE_RPM} per menit).`, { 'Retry-After': String(rl.retryAfter || 60) }) };

    return { user: { id: data.id, username: data.username, email: data.email, balance: Number(data.balance), keyPrefix: data.api_key_prefix || '', keyHash: hash } };
}

/* ═════════ ORDER ═════════ */
export const IDEM_RE = /^[\x21-\x7e]{1,100}$/;     // ASCII tercetak tanpa spasi, maks 100 karakter

const ORDER_COLS = 'id, invoice_no, status, delivery_status, delivery_data, quantity, unit_price, total_amount, amount, api_sku, api_idem, item_sku, product_slug, user_id, created_at';

export function orderStatusOf(o: any): 'FULFILLED' | 'PARTIAL' | 'FAILED' | 'PROCESSING' {
    if (o.delivery_status === 'FAILED') return 'FAILED';
    if (o.delivery_status !== 'DELIVERED') return 'PROCESSING';
    return o.delivery_data?.partial === true ? 'PARTIAL' : 'FULFILLED';
}
const keysOf = (o: any): string[] => (Array.isArray(o.delivery_data?.keys) ? o.delivery_data.keys.map(String) : []);

export function orderView(o: any, balance?: number) {
    return {
        id: o.id, code: o.invoice_no, status: orderStatusOf(o), sku: o.api_sku, quantity: Number(o.quantity),
        price: Number(o.total_amount), unitPrice: Number(o.unit_price ?? 0), currency: CURRENCY,
        keys: keysOf(o), ...(balance === undefined ? {} : { balance }), createdAt: o.created_at,
    };
}

export async function freshBalance(userId: string): Promise<number> {
    const { data } = await requireDb().from('users').select('balance').eq('id', userId).maybeSingle();
    return Number(data?.balance ?? 0);
}

async function findByIdem(userId: string, idem: string) {
    const { data } = await requireDb().from('orders').select(ORDER_COLS).eq('user_id', userId).eq('api_idem', idem).maybeSingle();
    return data as any;
}

/** Kunci per reseller: memori (cepat, 1 instance) + atomik di database (banyak instance serverless). */
const memLocks = new Set<string>();
async function acquireLock(userId: string): Promise<string | null> {
    if (memLocks.has(userId)) return null;
    const token = crypto.randomBytes(12).toString('hex');
    memLocks.add(userId);
    try {
        const { data, error } = await requireDb().rpc('api_lock_acquire', { p_user: userId, p_token: token, p_secs: 90 });
        if (error || data !== true) { memLocks.delete(userId); return null; }
        return token;
    } catch { memLocks.delete(userId); return null; }
}
async function releaseLock(userId: string, token: string) {
    memLocks.delete(userId);
    try { await requireDb().rpc('api_lock_release', { p_user: userId, p_token: token }); } catch { /* kunci kedaluwarsa sendiri */ }
}

/** Ambil key dari provider per unit. Ref turunan deterministik (user + Idempotency-Key + nomor unit) → ulang aman, tidak beli ganda. */
async function fulfillKeys(order: any, deadlineMs = 40_000): Promise<{ keys: string[]; error?: string; soldout: boolean }> {
    const qty = Number(order.quantity) || 1;
    const base = sha256(`${order.user_id}:${order.api_idem}`).slice(0, 32);
    const deadline = Date.now() + deadlineMs;
    const got: string[] = [];
    let lastError = '';
    const CONC = 4;
    for (let i = 0; i < qty; i += CONC) {
        if (Date.now() > deadline) break;
        const idx = Array.from({ length: Math.min(CONC, qty - i) }, (_, k) => i + k);
        const res = await Promise.all(idx.map((j) => thBuy(order.item_sku, `api-${base}-${j}`).catch((e: any) => ({ error: String(e?.message || 'error') }))));
        let any = false;
        for (const r of res as any[]) {
            if (r.keys?.length) { got.push(String(r.keys[0])); any = true; } else if (r.error) lastError = r.error;
        }
        if (!any) break;      // satu putaran penuh gagal: stok/saldo provider bermasalah, berhenti
    }
    // provider melaporkan stok habis / produk off → opsi tetap ditandai habis (jangan dinyalakan lagi saat refund)
    return { keys: got, error: lastError, soldout: /Stok di Thanhub habis|tidak tersedia di Thanhub/i.test(lastError) };
}

export interface ApiResult { http: number; body: any; headers?: Record<string, string> }
const errBody = (code: string, message: string) => ({ error: { code, message } });
const E = (http: number, code: string, message: string): ApiResult => ({ http, body: errBody(code, message) });

async function completeOrder(userId: string, order: any): Promise<ApiResult> {
    const f = await fulfillKeys(order);
    const { data, error } = await requireDb().rpc('api_order_finish', { p_invoice: order.invoice_no, p_keys: f.keys, p_reason: f.error || 'stok tidak tersedia', p_soldout: f.soldout });
    if (error) { console.error('[api_order_finish]', error.message); return E(500, 'INTERNAL', 'Terjadi kesalahan di server. Coba lagi dengan Idempotency-Key yang sama.'); }
    void data;
    const fresh = await findByIdem(userId, order.api_idem);
    if (!fresh || fresh.delivery_status === 'FAILED') return E(409, 'BUSY', 'Stok sedang tidak tersedia. Saldo tidak dipotong.');
    return { http: 200, body: { data: orderView(fresh, await freshBalance(userId)) } };
}

export async function createApiOrder(user: ApiUser, input: { idem: string; sku: string; quantity: number; target?: string }): Promise<ApiResult> {
    const sku = input.sku.toLowerCase();

    // 1) Request ulang (Idempotency-Key sama): kembalikan order yang sama TANPA memotong saldo lagi.
    const prior = await findByIdem(user.id, input.idem);
    if (prior) return replay(user, prior, sku);

    // 2) Validasi SKU dengan data segar
    const row = await resolveSku(sku);
    if (!row) return E(404, 'UNKNOWN_SKU', 'SKU tidak ditemukan.');
    if (row.maintenance) return E(400, 'PRODUCT_MAINTENANCE', 'Produk sedang maintenance.');
    const cfg = await getResellerConfig();
    const unit = resellerUnitPrice(cfg, row.productSlug, { price: row.publicPrice, reseller_price: row.resellerOverride });
    if (unit <= 0) return E(400, 'PRODUCT_MAINTENANCE', 'Produk sedang tidak tersedia.');

    // 3) Satu order per reseller sekaligus
    const token = await acquireLock(user.id);
    if (!token) return E(409, 'PURCHASE_PENDING', 'Masih ada order yang sedang diproses. Tunggu selesai lalu coba lagi.');
    try {
        // 4) Stok live di provider (gagal membaca = lolos; kegagalan kirim tetap direfund penuh)
        const live = await thLiveMap().catch(() => null);
        if (live) {
            const v = judgeLive(live.get(thVariantId(row.itemSku)), unit);
            if (!v.ok) return v.reason === 'soldout' ? E(409, 'BUSY', 'Stok sedang habis.') : E(400, 'PRODUCT_MAINTENANCE', 'Produk sedang tidak tersedia.');
        }

        // 5) Potong saldo + stok + catat order (satu transaksi atomik)
        const stamp = stampNow();
        const { data, error } = await requireDb().rpc('api_order_begin', {
            p_user: user.id, p_idem: input.idem, p_sku_code: sku, p_slug: row.productSlug, p_item_sku: row.itemSku,
            p_qty: input.quantity, p_unit: unit, p_invoice: `INV-${stamp}-${rid()}`, p_ref: `ORD-${stamp}${rid()}`, p_target: input.target || '',
        });
        if (error) return mapBeginError(error.message || '');
        const begin: any = data || {};

        const order = await findByIdem(user.id, input.idem);
        if (!order) return E(500, 'INTERNAL', 'Terjadi kesalahan di server.');
        if (begin.created === false) return replay(user, order, sku, true);

        // 6) Ambil key + selesaikan (PARTIAL kalau kurang)
        return await completeOrder(user.id, order);
    } catch (e: any) {
        console.error('[api order]', e);
        return E(500, 'INTERNAL', 'Terjadi kesalahan di server.');
    } finally {
        await releaseLock(user.id, token);
    }
}

function mapBeginError(m: string): ApiResult {
    if (m.includes('INSUFFICIENT_BALANCE')) {
        const x = /INSUFFICIENT_BALANCE (\d+) (\d+)/.exec(m);
        const msg = x ? `Saldo tidak cukup. Butuh Rp ${Number(x[1]).toLocaleString('id-ID')}, saldo kamu Rp ${Number(x[2]).toLocaleString('id-ID')}.` : 'Saldo tidak cukup.';
        return E(402, 'INSUFFICIENT_BALANCE', msg);
    }
    if (m.includes('IDEMPOTENCY_MISMATCH')) return E(422, 'IDEMPOTENCY_MISMATCH', 'Idempotency-Key ini sudah dipakai untuk SKU yang berbeda.');
    if (m.includes('FORBIDDEN')) return E(403, 'FORBIDDEN', 'Akun ini bukan reseller aktif.');
    if (m.includes('UNKNOWN_SKU')) return E(404, 'UNKNOWN_SKU', 'SKU tidak ditemukan.');
    if (m.includes('PRODUCT_MAINTENANCE')) return E(400, 'PRODUCT_MAINTENANCE', 'Produk sedang maintenance.');
    if (m.includes('INVALID_QTY')) return E(400, 'INVALID_QTY', 'quantity harus bilangan bulat 1 sampai 20.');
    if (m.includes('BUSY')) return E(409, 'BUSY', 'Stok tidak cukup.');
    console.error('[api_order_begin]', m);
    return E(500, 'INTERNAL', 'Terjadi kesalahan di server.');
}

/**
 * Order sudah ada untuk Idempotency-Key ini. Selesai → kembalikan hasil yang sama.
 * Masih "PROCESSING" (request sebelumnya terputus) → lanjutkan pengambilan key (aman: ref provider sama).
 */
async function replay(user: ApiUser, o: any, sku: string, haveLock = false): Promise<ApiResult> {
    if (o.api_sku !== sku) return E(422, 'IDEMPOTENCY_MISMATCH', 'Idempotency-Key ini sudah dipakai untuk SKU yang berbeda.');
    if (o.delivery_status === 'DELIVERED') return { http: 200, body: { data: orderView(o, await freshBalance(user.id)) } };
    if (o.delivery_status === 'FAILED') return E(409, 'BUSY', 'Stok tidak tersedia untuk order ini. Saldo sudah dikembalikan. Gunakan Idempotency-Key baru untuk mencoba lagi.');

    if (haveLock) return completeOrder(user.id, o);
    const token = await acquireLock(user.id);
    if (!token) return E(409, 'PURCHASE_PENDING', 'Order ini masih diproses. Coba lagi sebentar.');
    try {
        const cur = await findByIdem(user.id, o.api_idem);
        if (cur && cur.delivery_status !== 'PENDING') return replay(user, cur, sku, true);
        return await completeOrder(user.id, cur || o);
    } finally { await releaseLock(user.id, token); }
}

/* ═════════ RIWAYAT ORDER ═════════ */
export async function listApiOrders(userId: string, page: number, limit: number) {
    const from = (page - 1) * limit;
    const { data, count, error } = await requireDb().from('orders')
        .select(ORDER_COLS, { count: 'exact' }).eq('user_id', userId).eq('source', 'api')
        .order('created_at', { ascending: false }).range(from, from + limit - 1);
    if (error) throw new Error(error.message);
    const total = count || 0;
    return {
        page, limit, total, hasMore: from + (data?.length || 0) < total,
        items: (data || []).map((o: any) => ({
            id: o.id, code: o.invoice_no, status: orderStatusOf(o), sku: o.api_sku, quantity: Number(o.quantity),
            price: Number(o.total_amount), keysCount: keysOf(o).length, createdAt: o.created_at,
        })),
    };
}

export async function getApiOrder(userId: string, idOrCode: string) {
    const v = String(idOrCode || '').trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    if (!isUuid && !/^[A-Za-z0-9_-]{3,100}$/.test(v)) return null;
    const q = requireDb().from('orders').select(ORDER_COLS).eq('user_id', userId).eq('source', 'api');
    const { data } = await (isUuid ? q.eq('id', v) : q.eq('invoice_no', v)).maybeSingle();
    return data ? orderView(data, await freshBalance(userId)) : null;
}

/* ═════════ ADMIN ═════════ */
const esc = (v: string) => v.replace(/[\\%_]/g, (c) => '\\' + c);
const PW_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Password acak 12 karakter (tanpa huruf/angka yang mirip), dijamin lolos aturan password toko. */
export function randomPassword(len = 12): string {
    for (;;) {
        const pw = Array.from({ length: len }, () => PW_ALPHABET[crypto.randomInt(PW_ALPHABET.length)]).join('');
        if (!validatePasswordStrength(pw)) return pw;
    }
}

export async function adminListResellers(search = '', limit = 200) {
    let q = requireDb().from('users')
        .select('id, username, email, whatsapp, balance, is_banned, reseller_disabled, reseller_since, api_key_prefix, api_key_created_at, created_at, last_login_at')
        .eq('is_reseller', true).order('reseller_since', { ascending: false }).limit(limit);
    // `_` dan `%` adalah wildcard di ILIKE; di-escape supaya mencari "resel_" tidak ikut menemukan "reseller1"
    const t = esc(sanitizeText(search, 50).replace(/[,()\\]/g, ''));
    if (t) q = q.or(`username.ilike.%${t}%,email.ilike.%${t}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message.includes('is_reseller') ? 'Kolom reseller belum ada di database. Jalankan migrasi (lihat CARA-PASANG.txt).' : error.message);
    const ids = (data || []).map((u: any) => u.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
        const { data: ords } = await requireDb().from('orders').select('user_id').eq('source', 'api').eq('delivery_status', 'DELIVERED').in('user_id', ids).limit(20000);
        for (const o of ords || []) counts[o.user_id] = (counts[o.user_id] || 0) + 1;
    }
    return (data || []).map((u: any) => ({ ...u, balance: Number(u.balance), api_orders: counts[u.id] || 0 }));
}

const DUP_MSG = 'Username atau email sudah dipakai akun lain.';
const isDup = (m: string) => /duplicate|unique|23505/i.test(m || '');

async function findUserBy(identifier: string) {
    const id = sanitizeText(identifier, 255).toLowerCase();
    if (!id) return null;
    const col = id.includes('@') ? 'email' : 'username';
    const { data } = await requireDb().from('users').select('id, username, email, is_reseller, reseller_disabled, is_banned').ilike(col, esc(id)).maybeSingle();
    return data as any;
}

function cleanProfile(b: any, partial: boolean) {
    const out: Record<string, any> = {};
    if (!partial || b.username !== undefined) {
        const username = sanitizeText(b.username, 20);
        if (!USERNAME_RE.test(username)) throw new Error('Username 3–20 karakter, hanya huruf, angka, dan underscore.');
        out.username = username;
    }
    if (!partial || b.email !== undefined) {
        const email = sanitizeText(b.email, 120).toLowerCase();
        if (!EMAIL_RE.test(email)) throw new Error('Format email tidak valid.');
        out.email = email;
    }
    if (b.whatsapp !== undefined) {
        const wa = sanitizeText(b.whatsapp, 20).replace(/[^\d+]/g, '');
        out.whatsapp = wa || null;
    }
    return out;
}

/** Admin membuat akun reseller baru (tanpa biaya join). Akun langsung bisa login dan reseller aktif. */
export async function adminCreateReseller(adminName: string, b: any) {
    const prof = cleanProfile(b, false);
    const supplied = String(b.password || '');
    const generated = !supplied;
    const password = generated ? randomPassword() : supplied;
    const weak = validatePasswordStrength(password);
    if (weak) throw new Error(weak);
    const balance = Math.trunc(Number(b.balance) || 0);
    if (balance < 0 || balance > 100_000_000) throw new Error('Saldo awal tidak valid (0 – 100.000.000).');

    const db = requireDb();
    const [u1, u2] = await Promise.all([
        db.from('users').select('id').ilike('username', esc(prof.username)).limit(1),
        db.from('users').select('id').ilike('email', esc(prof.email)).limit(1),
    ]);
    if (u1.data?.length || u2.data?.length) throw new Error(DUP_MSG);

    const { data, error } = await db.from('users').insert({
        ...prof, password_hash: await hashPassword(password), is_reseller: true, reseller_since: new Date().toISOString(),
    }).select('id, username, email').single();
    if (error) {
        if (isDup(error.message)) throw new Error(DUP_MSG);
        throw new Error(error.message.includes('is_reseller') ? 'Kolom reseller belum ada di database. Jalankan migrasi (lihat CARA-PASANG.txt).' : error.message);
    }
    try {
        if (balance > 0) await adminAdjust(data.id, balance, 'Saldo awal reseller', adminName);
    } catch (e) {
        await db.from('users').delete().eq('id', data.id);      // jangan sisakan akun setengah jadi
        throw e;
    }
    let key: string | null = null;
    if (b.withKey) { const k = await createApiKey(data.id); if (k.ok) key = k.key; }
    return { id: data.id, username: data.username, email: data.email, balance, password: generated ? password : null, key };
}

/** Jadikan akun yang sudah ada sebagai reseller (gratis). Cari lewat username / email / userId. */
export async function adminPromote(b: any) {
    const u = b.userId && /^[0-9a-f-]{36}$/i.test(String(b.userId))
        ? (await requireDb().from('users').select('id, username, email, is_reseller, reseller_disabled, is_banned').eq('id', b.userId).maybeSingle()).data
        : await findUserBy(String(b.identifier || ''));
    if (!u) throw new Error('Akun tidak ditemukan. Isi username atau email yang terdaftar.');
    if (u.is_reseller) throw new Error(`${u.username} sudah menjadi reseller${u.reseller_disabled ? ' (sedang dinonaktifkan, aktifkan lewat tombol Aktifkan)' : ''}.`);
    const { error } = await requireDb().from('users').update({ is_reseller: true, reseller_disabled: false, reseller_since: new Date().toISOString() }).eq('id', u.id);
    if (error) throw new Error(error.message);
    return { id: u.id, username: u.username, email: u.email };
}

export async function adminUpdateReseller(userId: string, b: any) {
    const patch = cleanProfile(b, true);
    if (!Object.keys(patch).length) throw new Error('Tidak ada yang diubah.');
    if (patch.username || patch.email) {
        const db = requireDb();
        const checks = await Promise.all([
            patch.username ? db.from('users').select('id').ilike('username', esc(patch.username)).neq('id', userId).limit(1) : Promise.resolve({ data: [] as any[] }),
            patch.email ? db.from('users').select('id').ilike('email', esc(patch.email)).neq('id', userId).limit(1) : Promise.resolve({ data: [] as any[] }),
        ]);
        if (checks.some((c: any) => c.data?.length)) throw new Error(DUP_MSG);
    }
    const { data, error } = await requireDb().from('users').update(patch).eq('id', userId).eq('is_reseller', true).select('id, username, email');
    if (error) { if (isDup(error.message)) throw new Error(DUP_MSG); throw new Error(error.message); }
    if (!data?.length) throw new Error('Reseller tidak ditemukan.');
    return data[0];
}

/** Reset password. Kosongkan password = dibuatkan otomatis. Semua sesi login lama langsung tidak berlaku. */
export async function adminResetPassword(userId: string, password?: string) {
    const generated = !password;
    const pw = generated ? randomPassword() : String(password);
    const weak = validatePasswordStrength(pw);
    if (weak) throw new Error(weak);
    const db = requireDb();
    const { data: cur } = await db.from('users').select('token_version').eq('id', userId).maybeSingle();
    if (!cur) throw new Error('Akun tidak ditemukan.');
    const { error } = await db.from('users').update({ password_hash: await hashPassword(pw), token_version: (cur.token_version || 0) + 1 }).eq('id', userId);
    if (error) throw new Error(error.message);
    return { password: generated ? pw : null };
}

/** Admin membuatkan API key untuk reseller (tampil sekali di layar admin). Key lama mati. */
export async function adminCreateKeyFor(userId: string) {
    const r = await createApiKey(userId);
    if (!r.ok) throw new Error(r.message);
    return { key: r.key, prefix: r.prefix };
}

export async function adminSetBanned(userId: string, banned: boolean) {
    const db = requireDb();
    const { data: u } = await db.from('users').select('token_version').eq('id', userId).maybeSingle();
    if (!u) throw new Error('Akun tidak ditemukan.');
    const { error } = await db.from('users').update({ is_banned: banned, token_version: (u.token_version || 0) + 1 }).eq('id', userId);
    if (error) throw new Error(error.message);
}

/** Cabut status reseller (akun tetap ada sebagai user biasa, saldo tetap, API key dicabut). */
export async function adminDemote(userId: string) {
    const { data, error } = await requireDb().from('users').update({
        is_reseller: false, reseller_disabled: false, reseller_since: null, api_key_hash: null, api_key_prefix: null, api_key_created_at: null,
    }).eq('id', userId).eq('is_reseller', true).select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('Reseller tidak ditemukan.');
}

/** Hapus akun reseller permanen. Wajib ketik ulang username. Order tetap ada; mutasi saldo & riwayat isi saldo ikut terhapus. */
export async function adminDeleteReseller(userId: string, confirmUsername: string) {
    const db = requireDb();
    const { data: u } = await db.from('users').select('id, username, is_reseller').eq('id', userId).maybeSingle();
    if (!u || !u.is_reseller) throw new Error('Reseller tidak ditemukan.');
    if (String(confirmUsername || '').trim().toLowerCase() !== String(u.username).toLowerCase()) throw new Error('Konfirmasi username tidak cocok. Akun tidak dihapus.');
    const { error } = await db.from('users').delete().eq('id', userId);
    if (error) throw new Error(error.message);
    return { username: u.username };
}

export async function adminSetResellerDisabled(userId: string, disabled: boolean) {
    const { data, error } = await requireDb().from('users').update({ reseller_disabled: disabled }).eq('id', userId).eq('is_reseller', true).select('id');
    if (error) throw new Error(error.message);
    return Boolean(data?.length);
}

/** Daftar opsi + harga reseller efektif + kode API (atau alasan kenapa tidak masuk API), untuk halaman admin. */
export async function adminItemRows(cfg: ResellerConfig) {
    bust('rsl:catalog');
    const { rows, excluded } = await loadCatalogRows();
    return {
        included: rows.map((r) => ({
            itemId: r.itemId, product: r.product, label: r.label, apiCode: r.apiCode, publicPrice: r.publicPrice,
            resellerOverride: r.resellerOverride, eligible: isEligible(cfg, r.productSlug), slug: r.productSlug,
            effective: resellerUnitPrice(cfg, r.productSlug, { price: r.publicPrice, reseller_price: r.resellerOverride }),
        })),
        excluded,
    };
}

/** Semua produk aktif (untuk memilih produk mana yang masuk program harga reseller). */
export async function adminProductList() {
    const { data, error } = await requireDb().from('products').select('slug, name').eq('is_active', true).order('sort_order', { ascending: true }).range(0, 999);
    if (error) throw new Error(error.message);
    return (data || []) as { slug: string; name: string }[];
}

/** Validasi cakupan harga reseller dari form admin. Slug harus produk aktif yang ada. */
export async function cleanScope(scope: unknown, slugs: unknown): Promise<{ scope: 'all' | 'selected'; slugs: string[] }> {
    if (scope !== 'all' && scope !== 'selected') throw new Error('Cakupan harga reseller tidak valid.');
    if (scope === 'all') return { scope, slugs: [] };
    if (!Array.isArray(slugs) || slugs.some((x) => typeof x !== 'string')) throw new Error('Daftar produk tidak valid.');
    const want = Array.from(new Set((slugs as string[]).map((x) => x.toLowerCase())));
    if (want.length > 500) throw new Error('Terlalu banyak produk dipilih.');
    const have = new Set((await adminProductList()).map((p) => p.slug.toLowerCase()));
    const unknown = want.filter((x) => !have.has(x));
    if (unknown.length) throw new Error(`Produk tidak ditemukan: ${unknown.slice(0, 3).join(', ')}`);
    return { scope, slugs: want };
}

export async function adminSetItemResellerPrice(itemId: string, price: number | null) {
    if (!/^[0-9a-f-]{36}$/i.test(itemId)) throw new Error('ID opsi tidak valid.');
    if (price !== null && (!Number.isInteger(price) || price < 0 || price > 100_000_000)) throw new Error('Harga reseller tidak valid.');
    const { data, error } = await requireDb().from('product_items').update({ reseller_price: price && price > 0 ? price : null }).eq('id', itemId).select('id');
    if (error) throw new Error(error.message.includes('reseller_price') ? 'Kolom reseller_price belum ada. Jalankan supabase/migrations/2026-11-open-reseller.sql.' : error.message);
    bust('rsl:');
    bust('products:');
    return Boolean(data?.length);
}

