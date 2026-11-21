import { NextResponse } from 'next/server';
import {
    API_MAX_QTY, API_RATE_RPM, CURRENCY, IDEM_RE, SKU_RE,
    authenticateApi, buildApiProducts, createApiOrder, freshBalance, getApiOrder, getResellerConfig,
    listApiOrders, resolveSku, stockOf,
    type ApiFail, type ApiResult,
} from '@/lib/reseller';

/**
 * RESELLER API v1  —  /api/v1/*
 * Auth: Authorization: Bearer rk_live_...   |   Sukses: { data }   |   Gagal: { error: { code, message } }
 * Dokumentasi publik: /docs/api
 */
const HEADERS = { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const out = (http: number, body: unknown, extra?: Record<string, string>) => NextResponse.json(body, { status: http, headers: { ...HEADERS, ...(extra || {}) } });
const fail = (http: number, code: string, message: string, extra?: Record<string, string>) => out(http, { error: { code, message } }, extra);
const failOf = (f: ApiFail) => fail(f.http, f.code, f.message, f.headers);
const resOf = (r: ApiResult) => out(r.http, r.body, r.headers);

function match(method: string, seg: string[]): 'me' | 'balance' | 'products' | 'stock' | 'orders.list' | 'orders.create' | 'orders.get' | null {
    if (method === 'GET') {
        if (seg.length === 1) return (({ me: 'me', balance: 'balance', products: 'products', stock: 'stock', orders: 'orders.list' }) as Record<string, any>)[seg[0]] || null;
        if (seg.length === 2 && seg[0] === 'orders') return 'orders.get';
    }
    if (method === 'POST' && seg.length === 1 && seg[0] === 'orders') return 'orders.create';
    return null;
}

const int = (v: string | null, d: number, min: number, max: number) => {
    const n = Number(v);
    return v !== null && v !== '' && Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : d;
};

/** Dipanggil oleh route-route tipis di src/app/api/v1/**. seg = potongan path setelah /api/v1/ */
export async function handleV1(req: Request, segments: string[], method: 'GET' | 'POST') {
    const seg = segments.filter(Boolean);
    const route = match(method, seg);
    if (!route) return fail(404, 'NOT_FOUND', 'Endpoint tidak ditemukan.');

    try {
        const a = await authenticateApi(req);
        if ('fail' in a) return failOf(a.fail);
        const user = a.user;
        const url = new URL(req.url);

        if (route === 'me') {
            return out(200, { data: { username: user.username, role: 'RESELLER', currency: CURRENCY, keyPrefix: user.keyPrefix, rateLimitRpm: API_RATE_RPM, maxQuantity: API_MAX_QTY } });
        }
        if (route === 'balance') {
            return out(200, { data: { balance: await freshBalance(user.id), currency: CURRENCY } });
        }
        if (route === 'products') {
            const cfg = await getResellerConfig();
            return out(200, { data: { currency: CURRENCY, priceTier: 'reseller', items: await buildApiProducts(cfg.discount) } });
        }
        if (route === 'stock') {
            const sku = (url.searchParams.get('sku') || '').trim();
            if (!sku) return fail(400, 'DURATION_REQUIRED', 'Parameter sku wajib diisi, contoh: ?sku=drip.30d');
            const row = await resolveSku(sku);
            if (!row) return fail(404, 'UNKNOWN_SKU', 'SKU tidak ditemukan.');
            const cfg = await getResellerConfig();
            return out(200, { data: await stockOf(row, cfg.discount) });
        }
        if (route === 'orders.list') {
            const page = int(url.searchParams.get('page'), 1, 1, 100000);
            const limit = int(url.searchParams.get('limit'), 20, 1, 50);
            return out(200, { data: await listApiOrders(user.id, page, limit) });
        }
        if (route === 'orders.get') {
            const o = await getApiOrder(user.id, decodeURIComponent(seg[1]));
            return o ? out(200, { data: o }) : fail(404, 'NOT_FOUND', 'Order tidak ditemukan.');
        }

        // ---- POST /orders ----
        const idem = (req.headers.get('idempotency-key') || '').trim();
        if (!idem) return fail(400, 'IDEMPOTENCY_REQUIRED', 'Header Idempotency-Key wajib diisi (maksimal 100 karakter).');
        if (!IDEM_RE.test(idem)) return fail(400, 'IDEMPOTENCY_REQUIRED', 'Idempotency-Key maksimal 100 karakter, tanpa spasi dan karakter kontrol.');

        let body: any;
        try {
            const text = await req.text();
            if (text.length > 4000) return fail(400, 'INVALID_BODY', 'Body terlalu besar.');
            body = JSON.parse(text || '{}');
        } catch { return fail(400, 'INVALID_BODY', 'Body harus berupa JSON yang valid.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'INVALID_BODY', 'Body harus berupa objek JSON.');

        const sku = typeof body.sku === 'string' ? body.sku.trim().toLowerCase() : '';
        if (!sku || !SKU_RE.test(sku)) return fail(400, 'DURATION_REQUIRED', 'sku wajib diisi dengan format <produk>.<angka><d|h|m>, contoh: drip.30d');

        let quantity = 1;
        if (body.quantity !== undefined && body.quantity !== null) {
            const q = typeof body.quantity === 'number' ? body.quantity : typeof body.quantity === 'string' && /^\d{1,3}$/.test(body.quantity.trim()) ? Number(body.quantity) : NaN;
            if (!Number.isInteger(q) || q < 1 || q > API_MAX_QTY) return fail(400, 'INVALID_QTY', `quantity harus bilangan bulat 1 sampai ${API_MAX_QTY}.`);
            quantity = q;
        }

        let target: string | undefined;
        if (body.target !== undefined && body.target !== null) {
            if (typeof body.target !== 'string') return fail(400, 'INVALID_TARGET', 'target harus berupa teks (maksimal 80 karakter).');
            const t = body.target.replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
            if (t.length > 80) return fail(400, 'INVALID_TARGET', 'target maksimal 80 karakter.');
            target = t || undefined;
        }

        return resOf(await createApiOrder(user, { idem, sku, quantity, target }));
    } catch (e: any) {
        console.error('[api/v1]', route, e?.message || e);
        return fail(500, 'INTERNAL', 'Terjadi kesalahan di server. Coba lagi sebentar.');
    }
}
