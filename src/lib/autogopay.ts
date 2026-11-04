import crypto from 'crypto';
import axios from 'axios';
import { PaymentMethod } from './types';
import { getSiteSettings } from './settings';

/**
 * AutoGopay (QRIS dinamis GoPay Merchant)
 * Diport dari implementasi di proyek ryan-main (server.js).
 *
 * Endpoint (base URL tanpa /api/v1):
 *   POST /api/v1/payment/create              -> buat invoice, balik qris_string
 *   GET  /api/v1/payment/status/{reference}  -> cek status (pending/success/failed/expired)
 *
 * Auth: header X-API-Key. Webhook Secret adalah kredensial TERPISAH dari API Key
 * (khusus untuk verifikasi signature webhook).
 * `reference` yang dikirim = invoice_no order, jadi webhook & cek status bisa
 * dicocokkan balik ke order lokal.
 */

export const AUTOGOPAY_DEFAULT_BASE_URL = 'https://autogopay.net';

export interface AutogopayConfig {
    apiKey: string;
    webhookSecret: string;
    baseUrl: string;
}

// Admin kadang mengisi base URL ala gateway lain (.../api/v1) — buang suffix itu
// supaya path tidak dobel (/api/v1/api/v1/payment/...).
export function normalizeAutogopayBaseUrl(raw?: string): string {
    const v = String(raw || '').trim() || AUTOGOPAY_DEFAULT_BASE_URL;
    return v
        .replace(/\/+$/, '')
        .replace(/\/api\/v1(\/payment)?$/i, '')
        .replace(/\/+$/, '');
}

export async function getAutogopayConfig(): Promise<AutogopayConfig> {
    let settings: any = {};
    try {
        settings = await getSiteSettings();
    } catch {
        settings = {};
    }

    return {
        apiKey: String(settings.autogopay_api_key || process.env.AUTOGOPAY_API_KEY || '').trim(),
        webhookSecret: String(settings.autogopay_webhook_secret || process.env.AUTOGOPAY_WEBHOOK_SECRET || '').trim(),
        baseUrl: normalizeAutogopayBaseUrl(settings.autogopay_base_url || process.env.AUTOGOPAY_BASE_URL),
    };
}

interface AutogopayHttpResult {
    statusCode: number;
    json: any;
    raw: string;
}

// Satu helper request untuk semua endpoint AutoGopay. Selalu resolve dengan
// { statusCode, json, raw } — yang memutuskan error/tidak adalah pemanggil,
// karena arti 404 beda per endpoint.
async function autogopayRequest(
    config: Pick<AutogopayConfig, 'apiKey' | 'baseUrl'>,
    method: 'GET' | 'POST',
    apiPath: string,
    body?: Record<string, any>
): Promise<AutogopayHttpResult> {
    if (!config.apiKey) throw new Error('API Key AutoGopay belum dikonfigurasi');

    let url: URL;
    try {
        url = new URL(config.baseUrl + apiPath);
    } catch {
        throw new Error('Base URL AutoGopay tidak valid');
    }
    if (url.protocol !== 'https:') throw new Error('Base URL AutoGopay harus https://');

    try {
        const res = await axios.request({
            url: url.toString(),
            method,
            data: body,
            headers: {
                'X-API-Key': config.apiKey,
                Accept: 'application/json',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                'User-Agent': 'EpepTopupStore/1.0',
            },
            timeout: 15000,
            // Jangan throw untuk status non-2xx; ditangani pemanggil
            validateStatus: () => true,
            // Ambil body mentah supaya aman kalau bukan JSON
            transformResponse: [(d) => d],
            responseType: 'text',
        });

        const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
        let json: any = null;
        try {
            json = raw ? JSON.parse(raw) : null;
        } catch {
            json = null;
        }
        return { statusCode: res.status, json, raw };
    } catch (e: any) {
        if (e?.code === 'ECONNABORTED') throw new Error('AutoGopay timeout');
        throw new Error('Network error: ' + (e?.message || e));
    }
}

/**
 * Daftar channel pembayaran AutoGopay (hanya QRIS dinamis)
 */
export function getAutogopayPaymentChannels(): PaymentMethod[] {
    return [
        {
            id: 'pm-autogopay-qris',
            code: 'QRIS',
            name: 'QRIS Otomatis (AutoGopay)',
            group_name: 'QRIS',
            image_url: 'https://wijayapay.com/storage/logo/payment/qris.png',
            fee_amount: 0,
            fee_percent: 0,
            min_trx: 1000,
            max_trx: 10000000,
            type_fee: 'merchant',
            is_active: true,
            tutorial_pembayaran:
                '1. Buka aplikasi yang mendukung pembayaran QRIS (DANA, GoPay, OVO, ShopeePay, BCA, Livin, dll).\n2. Pilih menu Scan / Bayar QRIS.\n3. Pindai kode QR yang tertera pada layar.\n4. Bayar tepat sesuai nominal yang tertera.\n5. Status lunas & kode lisensi otomatis keluar setelah pembayaran terdeteksi.',
        },
    ];
}

/**
 * Buat invoice QRIS dinamis di AutoGopay.
 * `order_id` dikirim sebagai `reference`.
 */
export async function createAutogopayTransaction({
    order_id,
    amount,
}: {
    order_id: string;
    amount: number;
}): Promise<
    | { success: true; data: { qris_string: string; total_payment: number; expired_at: string | null } }
    | { success: false; message: string; raw?: any }
> {
    try {
        const config = await getAutogopayConfig();
        const r = await autogopayRequest(config, 'POST', '/api/v1/payment/create', {
            amount: Math.round(Number(amount)),
            reference: String(order_id),
        });

        const d = r.json?.data;
        if (!(r.statusCode >= 200 && r.statusCode < 300) || !r.json?.success || !d?.qris_string) {
            return {
                success: false,
                message:
                    r.json?.message ||
                    `AutoGopay error (HTTP ${r.statusCode}): ${String(r.raw || '').slice(0, 150) || '(response kosong)'}`,
                raw: r.json,
            };
        }

        // expired_at dipakai langsung oleh frontend (timer hitung mundur) —
        // kalau formatnya tidak bisa diparse, kirim null daripada NaN:NaN.
        const expiredAt = d.expired_at && !isNaN(Date.parse(d.expired_at)) ? String(d.expired_at) : null;
        const total = Number(d.amount);

        return {
            success: true,
            data: {
                qris_string: String(d.qris_string),
                total_payment: total > 0 ? total : Math.round(Number(amount)),
                expired_at: expiredAt,
            },
        };
    } catch (error: any) {
        console.warn('[AutoGopay Create Error]:', error?.message || error);
        return {
            success: false,
            message: error?.message || 'Koneksi ke gateway AutoGopay gagal.',
        };
    }
}

export type AutogopayNormalizedStatus = 'paid' | 'pending' | 'expired' | 'cancelled' | 'unknown';

/**
 * Cek status invoice. Dipakai sebagai cadangan webhook (polling dari halaman
 * bayar / cek admin). Hasil dinormalisasi: success -> paid, failed -> cancelled.
 * Mengembalikan null kalau gagal menghubungi gateway.
 */
export async function checkAutogopayStatus(
    reference: string
): Promise<{ status: AutogopayNormalizedStatus; raw?: any } | null> {
    try {
        const config = await getAutogopayConfig();
        const r = await autogopayRequest(
            config,
            'GET',
            `/api/v1/payment/status/${encodeURIComponent(reference)}`
        );
        const d = r.json?.data;
        if (!(r.statusCode >= 200 && r.statusCode < 300) || !r.json?.success || !d?.status) {
            console.warn('[AutoGopay Status]:', r.json?.message || `HTTP ${r.statusCode}`);
            return null;
        }

        // Pastikan yang dibalas memang transaksi yang kita tanya — jangan sampai
        // status invoice lain ikut menandai order ini lunas.
        if (d.reference && String(d.reference) !== String(reference)) {
            console.warn(`[AutoGopay Status] reference respons (${d.reference}) tidak cocok dengan ${reference}`);
            return null;
        }

        const s = String(d.status).toLowerCase();
        let status: AutogopayNormalizedStatus = 'unknown';
        if (s === 'success') status = 'paid';
        else if (s === 'pending') status = 'pending';
        else if (s === 'expired') status = 'expired';
        else if (s === 'failed') status = 'cancelled';

        return { status, raw: r.json };
    } catch (error: any) {
        console.warn('[AutoGopay Status Error]:', error?.message || error);
        return null;
    }
}

/**
 * Test koneksi TANPA bikin invoice sungguhan: tanya status reference acak.
 *   404 -> API Key diterima, endpoint hidup, reference tidak ada (normal)
 *   401 -> API Key salah/nonaktif   403 -> akun tidak berlangganan/tanpa izin
 */
export async function testAutogopayConnection(config: Pick<AutogopayConfig, 'apiKey' | 'baseUrl'>): Promise<true> {
    const r = await autogopayRequest(
        { apiKey: config.apiKey, baseUrl: normalizeAutogopayBaseUrl(config.baseUrl) },
        'GET',
        `/api/v1/payment/status/test-ping-${Date.now()}`
    );
    if (r.statusCode === 404 || (r.statusCode >= 200 && r.statusCode < 300)) return true;
    if (r.statusCode === 401) throw new Error(r.json?.message || 'API Key AutoGopay tidak valid / dinonaktifkan (401)');
    if (r.statusCode === 403) throw new Error(r.json?.message || 'Akun AutoGopay tidak berlangganan / tidak punya izin (403)');
    throw new Error(r.json?.message || `AutoGopay membalas HTTP ${r.statusCode}: ${String(r.raw || '').slice(0, 120)}`);
}

/**
 * Signature webhook = HMAC-SHA256(Webhook Secret, payload JSON TANPA field `signature`),
 * dikirim di body field `signature`.
 *
 * Hasil hash bergantung pada cara serialisasi JSON pengirim (contoh resmi mereka
 * PHP json_encode, yang meng-escape "/" jadi "\/" dan non-ASCII jadi \uXXXX —
 * beda dari JSON.stringify Node). Karena itu signature dicocokkan ke beberapa
 * bentuk serialisasi yang wajar dari payload yang sama; semuanya tetap butuh
 * Webhook Secret, jadi tidak melemahkan keamanan.
 */
function autogopaySignatureCandidates(rawBody: string, parsed: any): string[] {
    const out: string[] = [];
    const { signature: _sig, ...rest } = parsed || {};
    const compact = JSON.stringify(rest);
    out.push(compact);
    // Gaya PHP json_encode default: "/" -> "\/", non-ASCII -> \uXXXX (huruf kecil)
    out.push(
        compact
            .replace(/\//g, '\\/')
            .replace(/[\u0080-\uffff]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'))
    );
    // Raw body persis, hanya field signature dibuang (urutan/format asli terjaga)
    const sigField = /,\s*"signature"\s*:\s*"[^"]*"/;
    const sigFirst = /"signature"\s*:\s*"[^"]*"\s*,\s*/;
    if (sigField.test(rawBody)) out.push(rawBody.replace(sigField, ''));
    else if (sigFirst.test(rawBody)) out.push(rawBody.replace(sigFirst, ''));
    return out;
}

export function verifyAutogopayWebhookSignature({
    rawBody,
    body,
    secret,
}: {
    rawBody: string;
    body: any;
    secret: string;
}): boolean {
    const signature = body && typeof body.signature === 'string' ? body.signature.trim().toLowerCase() : '';
    if (!secret || !signature || !rawBody) return false;

    const sigA = Buffer.from(signature);
    return autogopaySignatureCandidates(rawBody, body).some((payload) => {
        const sigB = Buffer.from(crypto.createHmac('sha256', secret).update(payload).digest('hex'));
        return sigA.length === sigB.length && crypto.timingSafeEqual(sigA, sigB);
    });
}
