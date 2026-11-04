import { getSiteSettings } from './settings';
import { requireDb } from './supabase';
import { bust, memo } from './cache';
import { sendPlainMail } from './email';

/**
 * Integrasi Thanhub (API v1).
 *  - Auth   : Authorization: Bearer thb_xxx
 *  - Produk : GET  /api/v1/products
 *  - Order  : POST /api/v1/orders {variant_id, qty, ref}  (ref = nomor invoice → anti beli ganda)
 * Satu-satunya provider key. Produk & varian diisi MANUAL lewat panel admin (tidak ada sinkron otomatis).
 * Kolom SKU varian = ID varian di Thanhub (boleh ditulis "123" atau "thb:123", keduanya diterima).
 */
export const THB_PREFIX = 'thb:';
/** Ambil ID varian Thanhub dari SKU (awalan "thb:" opsional). */
export const thVariantId = (sku: string) => String(sku || '').trim().replace(/^thb:/i, '');

export interface ThConfig { baseUrl: string; apiKey: string }

/** Rapikan alamat yang ditempel user: tambah https://, buang spasi, /api/v1, /resseler, dan garis miring di akhir. */
export function normalizeBaseUrl(input: string): string {
    let u = String(input || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    u = u.replace(/\s+/g, '').replace(/\/+$/, '').replace(/\/(api\/v1|resseler|reseller)$/i, '').replace(/\/+$/, '');
    return u;
}

/** Tolak alamat internal (cegah SSRF). */
export function isSafeBaseUrl(u: string): boolean {
    try {
        const x = new URL(u);
        if (x.protocol !== 'https:' && x.protocol !== 'http:') return false;
        const h = x.hostname.toLowerCase();
        if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
        if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === '::1' || h.startsWith('[')) return false;
        return h.includes('.');
    } catch { return false; }
}

export async function getThanhubConfig(): Promise<ThConfig> {
    const s: any = await getSiteSettings().catch(() => ({}));
    return {
        baseUrl: normalizeBaseUrl(s.thanhub_base_url || process.env.THANHUB_BASE_URL || ''),
        apiKey: String(s.thanhub_api_key || process.env.THANHUB_API_KEY || '').trim(),
    };
}

export const thanhubReady = (c: ThConfig) => Boolean(c.baseUrl && c.apiKey);

interface ThRes { status: number; json: any; network?: boolean; notJson?: boolean }

async function thRequest(cfg: Pick<ThConfig, 'baseUrl' | 'apiKey'>, method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 8000): Promise<ThRes> {
    if (!cfg.baseUrl || !isSafeBaseUrl(cfg.baseUrl)) return { status: 0, json: null, network: true };
    try {
        const res = await fetch(`${cfg.baseUrl}/api/v1${path}`, {
            method,
            headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await res.text();
        try { return { status: res.status, json: JSON.parse(text) }; }
        catch { return { status: res.status, json: null, notJson: true }; }
    } catch {
        return { status: 0, json: null, network: true };
    }
}

/** Pesan error yang mudah dimengerti pemula. */
export function explainThError(r: ThRes): string {
    if (r.network) return 'Tidak bisa terhubung ke alamat Thanhub. Cek penulisan alamatnya (contoh: https://namathanhub.my.id).';
    if (r.notJson) return 'Alamat itu bukan alamat API Thanhub (balasannya bukan data). Pastikan alamat web Thanhub yang benar, tanpa tambahan apa pun.';
    const code = r.json?.code;
    if (code === 'invalid_key' || r.status === 401) return 'API key salah atau sudah dicabut. Buat key baru di portal Thanhub, lalu tempel lagi (jangan ada spasi).';
    if (code === 'ip_not_allowed' || r.status === 403) return 'Thanhub menolak server ini karena API key dikunci ke IP tertentu. Buat key baru dan KOSONGKAN isian "IP server" (IP Vercel berubah-ubah).';
    if (code === 'rate_limited' || r.status === 429) return 'Terlalu banyak permintaan ke Thanhub. Tunggu 1 menit lalu coba lagi.';
    if (code === 'insufficient_balance' || r.status === 402) return 'Saldo akun Thanhub tidak cukup. Isi saldo dulu di Thanhub.';
    if (code === 'out_of_stock') return 'Stok di Thanhub habis.';
    if (code === 'unavailable') return 'Produk sedang tidak tersedia di Thanhub.';
    if (r.status === 404) return 'Alamat Thanhub kemungkinan salah (jalur /api/v1 tidak ditemukan).';
    return r.json?.message || `Thanhub membalas error (HTTP ${r.status}).`;
}

/* ───────── Tes koneksi ───────── */
export async function thTest(cfg: Pick<ThConfig, 'baseUrl' | 'apiKey'>) {
    const bal = await thRequest(cfg, 'GET', '/balance');
    if (!bal.json?.success) return { success: false as const, message: explainThError(bal) };
    const prod = await thRequest(cfg, 'GET', '/products', undefined, 15000);
    const list: any[] = prod.json?.success && Array.isArray(prod.json.data) ? prod.json.data : [];
    return {
        success: true as const,
        balance: Number(bal.json.data?.balance) || 0,
        name: String(bal.json.data?.name || ''),
        products: list.length,
        variants: list.reduce((n, p) => n + (p.variants?.length || 0), 0),
    };
}

/* ───────── Beli key ───────── */
export interface KeyResult { keys?: string[]; error?: string; expiresAt?: string | null }

/**
 * Beli 1 key di Thanhub. ref = nomor invoice → kalau koneksi putus lalu diulang, Thanhub tidak memotong saldo dua kali.
 */
export async function thBuy(sku: string, ref: string): Promise<KeyResult> {
    const cfg = await getThanhubConfig();
    if (!thanhubReady(cfg)) return { error: 'Thanhub belum disambungkan di panel admin.' };
    const variantId = thVariantId(sku);

    let last: ThRes = { status: 0, json: null, network: true };
    for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 1000));
        last = await thRequest(cfg, 'POST', '/orders', { variant_id: variantId, qty: 1, ref });
        const j = last.json;
        if (j?.success && Array.isArray(j.data?.keys) && j.data.keys.length) {
            const keys = j.data.keys.map((k: any) => String(typeof k === 'string' ? k : k.key)).filter(Boolean);
            return { keys, expiresAt: j.data.keys[0]?.expires_at || null };
        }
        const code = j?.code;
        if (code === 'insufficient_balance' || last.status === 402) {
            await thAlertAdmin('failed', 'Pembelian key ditolak Thanhub: saldo akun Thanhub tidak cukup. Pembeli otomatis direfund ke saldo akunnya, tapi toko tidak bisa mengirim key sampai saldo Thanhub diisi.');
            break;
        }
        if (code === 'out_of_stock' || code === 'unavailable') {
            await requireDb().from('product_items').update({ in_stock: false, stock: 0 }).eq('sku', sku);
            bust('products:');
            break;
        }
        // Hanya ulangi untuk masalah sementara (aman karena ref sama = tidak beli ganda)
        const retryable = last.network || code === 'ref_in_progress' || code === 'server_error' || last.status >= 500;
        if (!retryable) break;
    }
    return { error: explainThError(last) };
}

/** Pintu tunggal ambil key (Thanhub adalah satu-satunya provider). */
export async function orderLicenseKey(sku: string, opts: { androidId?: string; ref: string }): Promise<KeyResult> {
    void opts.androidId;
    return thBuy(sku, opts.ref);
}


/* ═════════ CEK LIVE: stok & harga Thanhub tepat sebelum pembeli diberi QR / saldo dipotong ═════════ */
export interface LiveVariant { stock: number; buyable: boolean; cost: number }

/** Katalog Thanhub terkini (cache 30 dtk per instance, request bersamaan digabung). null = tidak terbaca → jangan blokir pembeli. */
async function thLiveMap(): Promise<Map<string, LiveVariant> | null> {
    const cfg = await getThanhubConfig();
    if (!thanhubReady(cfg)) return null;
    try {
        return await memo('thlive:' + cfg.baseUrl, 30_000, async () => {
            const r = await thRequest(cfg, 'GET', '/products', undefined, 8000);
            if (!r.json?.success || !Array.isArray(r.json.data)) throw new Error('thanhub live gagal');
            const m = new Map<string, LiveVariant>();
            for (const p of r.json.data) {
                for (const v of (Array.isArray(p.variants) ? p.variants : [])) {
                    if (v?.id == null) continue;
                    m.set(String(v.id), { stock: Math.max(0, Number(v.stock) || 0), buyable: p.status === 'available', cost: Math.max(0, Number(v.price) || 0) });
                }
            }
            return m;
        });
    } catch {
        return null;
    }
}

export type LiveVerdict = { ok: true } | { ok: false; reason: 'gone' | 'soldout' | 'price'; message: string };

/** Murni (mudah dites): putuskan boleh/tidak dari data live. */
export function judgeLive(v: LiveVariant | undefined, sellingPrice: number): LiveVerdict {
    if (!v) return { ok: false, reason: 'gone', message: 'Varian ini sudah tidak tersedia.' };
    if (!v.buyable || v.stock <= 0) return { ok: false, reason: 'soldout', message: 'Stok varian ini sedang habis. Coba varian lain atau kembali lagi nanti.' };
    if (sellingPrice <= v.cost) return { ok: false, reason: 'price', message: 'Harga produk ini sedang diperbarui. Muat ulang halaman lalu coba lagi sebentar lagi.' };
    return { ok: true };
}

/**
 * Dipanggil sebelum QRIS dibuat / saldo dipotong. Gagal membaca Thanhub = LOLOS (kegagalan kirim tetap direfund otomatis),
 * jadi gangguan Thanhub tidak mematikan toko. Hanya MEMBLOKIR pembelian (stok habis / varian hilang / harga jual di bawah modal);
 * tidak mengubah data produk — harga & stok dikelola manual oleh admin.
 */
export async function thLiveCheck(sku: string, sellingPrice: number): Promise<LiveVerdict> {
    const map = await thLiveMap();
    if (!map) return { ok: true };
    return judgeLive(map.get(thVariantId(sku)), sellingPrice);
}

/* ═════════ PERINGATAN SALDO THANHUB ═════════ */
const LOW_BALANCE = Number(process.env.THANHUB_LOW_BALANCE || 50_000);
const ALERT_EVERY_MS = 6 * 3600_000; // maksimal 1 email per 6 jam per jenis

/** Kirim email ke semua admin ber-email. Dibatasi 1x/6 jam per jenis supaya tidak membanjiri inbox. Return true bila terkirim. */
export async function thAlertAdmin(kind: 'low' | 'failed', detail: string): Promise<boolean> {
    try {
        const s: any = await getSiteSettings();
        const key = `thanhub_alert_${kind}_at`;
        const last = Date.parse(String(s[key] || '')) || 0;
        if (Date.now() - last < ALERT_EVERY_MS) return false;

        const { data } = await requireDb().from('admin_users').select('email').not('email', 'is', null);
        const to = Array.from(new Set([...(data || []).map((r: any) => String(r.email || '').trim()), String(process.env.ALERT_EMAIL || '').trim()].filter(Boolean)));
        if (!to.length) return false;

        const site = String(s.site_name || 'Toko');
        const subject = kind === 'low' ? `[${site}] Saldo Thanhub menipis` : `[${site}] Pembelian key gagal: saldo Thanhub habis`;
        const esc = (x: string) => x.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
        const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px;border:1px solid #ddd;border-radius:12px">
            <h2 style="margin:0 0 8px">${esc(subject)}</h2><p style="color:#333">${esc(detail)}</p>
            <p style="color:#666;font-size:13px">Isi saldo di portal Thanhub agar pembelian key tetap berjalan otomatis. Email ini dikirim maksimal sekali per 6 jam.</p></div>`;
        let sent = false;
        for (const addr of to) sent = (await sendPlainMail(addr, subject, html)) || sent;
        if (sent) {
            const { updateSiteSettings } = await import('./settings');
            await updateSiteSettings({ [key]: new Date().toISOString() } as any);
        }
        return sent;
    } catch {
        return false;
    }
}

/** Baca saldo Thanhub; kirim peringatan bila di bawah batas (env THANHUB_LOW_BALANCE, bawaan Rp 50.000). */
export async function thCheckBalance() {
    const cfg = await getThanhubConfig();
    if (!thanhubReady(cfg)) return { checked: false as const };
    const r = await thRequest(cfg, 'GET', '/balance');
    if (!r.json?.success) return { checked: false as const, message: explainThError(r) };
    const balance = Number(r.json.data?.balance) || 0;
    let alerted = false;
    if (balance < LOW_BALANCE) alerted = await thAlertAdmin('low', `Saldo Thanhub tinggal Rp ${balance.toLocaleString('id-ID')} (batas peringatan Rp ${LOW_BALANCE.toLocaleString('id-ID')}).`);
    return { checked: true as const, balance, low: balance < LOW_BALANCE, alerted };
}

/** Satu putaran cron: cek saldo Thanhub (email peringatan ke admin bila tipis). */
export async function thCronTick() {
    const cfg = await getThanhubConfig();
    if (!thanhubReady(cfg)) return { success: false as const, message: 'Thanhub belum disambungkan.' };
    const balance = await thCheckBalance().catch(() => ({ checked: false as const }));
    return { success: true as const, balance };
}
