import { randomUUID } from 'crypto';
import { getOrder, requireDb, updateOrderByInvoice } from './supabase';
import { orderLicenseKey, thLiveCheck } from './thanhub';
import { sendOrderPaidEmail } from './email';
import type { AppUser, LedgerEntry, Order, PaymentMethod, Topup } from './types';
import { getSiteSettings } from './settings';
import { checkPaymentStatus, createPaymentTransaction as createWijayapayTransaction, getPaymentChannels as getWijayapayChannels } from './wijayapay';
import { checkAutogopayStatus, createAutogopayTransaction, getAutogopayPaymentChannels } from './autogopay';
import { memo } from './cache';

export const TOPUP_MIN = Number(process.env.TOPUP_MIN || 10000);
export const TOPUP_MAX = Number(process.env.TOPUP_MAX || 5000000);

const rid = () => Math.random().toString(36).slice(2, 7).toUpperCase();

/* ───────── TOP UP ───────── */
export async function createTopup(user: AppUser, amount: number, paymentCode: string) {
    if (!Number.isInteger(amount) || amount < TOPUP_MIN || amount > TOPUP_MAX) {
        return { success: false as const, message: `Nominal top up harus Rp ${TOPUP_MIN.toLocaleString('id-ID')} – Rp ${TOPUP_MAX.toLocaleString('id-ID')}.` };
    }
    const db = requireDb();

    // Batasi tagihan menggantung: maksimal 3 PENDING dalam 1 jam per akun
    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count } = await db.from('topups').select('id', { head: true, count: 'exact' }).eq('user_id', user.id).eq('status', 'PENDING').gte('created_at', since);
    if ((count || 0) >= 3) {
        return { success: false as const, message: 'Masih ada 3 tagihan top up yang belum dibayar. Selesaikan atau tunggu kedaluwarsa dulu.' };
    }

    const stamp = Date.now().toString().slice(-8);
    const invoiceNo = `TOP-${stamp}-${rid()}`;
    const refId = `TPR-${stamp}${rid()}`;

    const charge = await createCharge({ invoiceNo, refId, amount, paymentCode });
    if (!charge.success) return { success: false as const, message: charge.message || 'Gagal membuat tagihan.' };

    const row = {
        invoice_no: invoiceNo,
        user_id: user.id,
        amount,
        fee: charge.fee || 0,
        total_amount: charge.total || amount,
        gateway: charge.gateway,
        payment_method: charge.method?.code,
        payment_name: charge.method?.name,
        payment_data: charge.paymentData || {},
        status: 'PENDING',
    };
    const { data, error } = await db.from('topups').insert(row).select().single();
    if (error) return { success: false as const, message: 'Gagal menyimpan tagihan: ' + error.message };
    return { success: true as const, topup: data as Topup };
}

export async function getTopupForUser(invoice: string, userId: string): Promise<Topup | null> {
    if (!/^[A-Za-z0-9_-]{3,100}$/.test(invoice)) return null;
    const { data } = await requireDb().from('topups').select('*').eq('invoice_no', invoice).eq('user_id', userId).maybeSingle();
    return (data as Topup) || null;
}

export async function listTopups(userId: string, limit = 20): Promise<Topup[]> {
    const { data } = await requireDb()
        .from('topups')
        .select('id, invoice_no, amount, fee, total_amount, payment_name, status, created_at, paid_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
    return (data || []) as any;
}

/** Idempotent: aman dipanggil berkali-kali oleh webhook / polling / admin. */
export async function settleTopup(invoiceNo: string) {
    const { data, error } = await requireDb().rpc('settle_topup', { p_invoice: invoiceNo });
    if (error) throw new Error(error.message);
    const r: any = Array.isArray(data) ? data[0] : data;
    return { ok: !!r?.ok, status: String(r?.status || ''), credited: Number(r?.credited || 0), balance: Number(r?.new_balance || 0) };
}

export async function markTopupStatus(invoiceNo: string, status: 'EXPIRED' | 'FAILED' | 'CANCELLED') {
    await requireDb().from('topups').update({ status }).eq('invoice_no', invoiceNo).eq('status', 'PENDING');
}

/* ───────── MUTASI SALDO ───────── */
export async function listLedger(userId: string, limit = 30): Promise<LedgerEntry[]> {
    const { data } = await requireDb()
        .from('wallet_ledger')
        .select('id, kind, amount, balance_after, ref, note, created_at')
        .eq('user_id', userId)
        .order('id', { ascending: false })
        .limit(limit);
    return ((data || []) as any[]).map((r) => ({ ...r, amount: Number(r.amount), balance_after: Number(r.balance_after) }));
}

export async function adminAdjust(userId: string, delta: number, note: string, adminName: string) {
    const { data, error } = await requireDb().rpc('admin_adjust_balance', { p_user: userId, p_delta: delta, p_note: note, p_admin: adminName });
    if (error) {
        if (/INSUFFICIENT_BALANCE/.test(error.message)) throw new Error('Saldo user tidak cukup untuk dikurangi.');
        if (/USER_NOT_FOUND/.test(error.message)) throw new Error('User tidak ditemukan.');
        throw new Error(error.message);
    }
    return Number(data);
}


export function maintenanceMessage(name?: string | null, note?: string | null): string {
    const n = String(note || '').trim();
    return n
        ? `${name || 'Produk ini'} sedang maintenance. ${n}`
        : `${name || 'Produk ini'} sedang maintenance, belum bisa dibeli sementara. Coba lagi nanti ya.`;
}

/* ───────── BELI PAKAI SALDO ───────── */
export async function buyWithBalance(user: AppUser, input: { productSlug: string; itemSku: string; gameId?: string; zoneId?: string; whatsapp?: string }) {
    const db = requireDb();
    const stamp = Date.now().toString().slice(-8);
    const invoiceNo = `INV-${stamp}-${rid()}`;
    const refId = `ORD-${stamp}${rid()}`;

    // 0a) Produk sedang maintenance → tolak sebelum saldo disentuh
    const { data: prodRow } = await db.from('products').select('*').eq('slug', input.productSlug).maybeSingle();
    if (prodRow && prodRow.maintenance === true) {
        return { success: false as const, code: 'MAINTENANCE', message: maintenanceMessage(prodRow.name, prodRow.maintenance_note) };
    }

    // 0) Stok & harga LIVE di Thanhub (gagal membaca = lolos)
    const { data: pre } = await db.from('product_items').select('sku, price').eq('product_slug', input.productSlug).eq('sku', input.itemSku).maybeSingle();
    if (pre) {
        const live = await thLiveCheck(pre.sku, Math.round(Number(pre.price)));
        if (!live.ok) return { success: false as const, code: 'ITEM_UNAVAILABLE', message: live.message };
    }

    // 1) Potong saldo + kurangi stok + buat pesanan — SATU transaksi atomik di database
    const { data, error } = await db.rpc('purchase_item', {
        p_user: user.id,
        p_slug: input.productSlug,
        p_sku: input.itemSku,
        p_invoice: invoiceNo,
        p_ref: refId,
        p_game_id: input.gameId || '',
        p_zone: input.zoneId || '',
        p_whatsapp: input.whatsapp || '',
        p_email: user.email,
    });
    if (error) {
        const m = error.message || '';
        if (m.includes('INSUFFICIENT_BALANCE')) return { success: false as const, code: 'INSUFFICIENT_BALANCE', message: 'Saldo tidak cukup. Silakan top up dulu.' };
        if (m.includes('ITEM_UNAVAILABLE')) return { success: false as const, code: 'ITEM_UNAVAILABLE', message: 'Produk/varian tidak tersedia atau stok habis.' };
        if (m.includes('USER_INVALID')) return { success: false as const, code: 'USER_INVALID', message: 'Akun tidak valid.' };
        console.error('[purchase_item]', m);
        return { success: false as const, code: 'ERROR', message: 'Gagal memproses pesanan. Coba lagi.' };
    }
    const order = (Array.isArray(data) ? data[0] : data) as Order;

    // 2) Minta lisensi ke provider & simpan. Gagal → refund otomatis penuh.
    const d = await deliverLicense(order);
    if (!d.success) {
        return { success: false as const, code: 'DELIVERY_FAILED', message: 'Pengiriman lisensi gagal, saldo kamu sudah dikembalikan otomatis. Coba lagi sebentar lagi atau hubungi admin.' };
    }

    const { data: u } = await db.from('users').select('balance').eq('id', user.id).maybeSingle();
    return { success: true as const, invoice_no: invoiceNo, balance: Number(u?.balance ?? 0) };
}

/**
 * Minta lisensi ke provider (Thanhub) lalu simpan ke pesanan.
 * Dipakai bersama oleh pembayaran saldo DAN pembayaran QRIS langsung.
 * Gagal → refund_order otomatis (uang masuk ke saldo akun pemilik pesanan). Hanya panggil untuk pesanan berstatus PAID.
 */
export async function deliverLicense(order: Order): Promise<{ success: true; order: Order } | { success: false; reason: string }> {
    const db = requireDb();
    const invoiceNo = order.invoice_no;
    let keys: string[] = [];
    let failReason = '';
    let expiresAt: string | null = null;
    try {
        const gameId = order.user_id_game && order.user_id_game !== '-' ? order.user_id_game : undefined;
        const res = await orderLicenseKey(order.item_sku, { androidId: gameId, ref: invoiceNo });
        if (res.keys?.length) { keys = res.keys; expiresAt = res.expiresAt || null; }
        else failReason = res.error || 'Provider lisensi belum siap';
    } catch (e: any) {
        failReason = e?.message || 'Provider error';
    }

    if (!keys.length) {
        await db.rpc('refund_order', { p_invoice: invoiceNo, p_reason: failReason.slice(0, 200) });
        return { success: false, reason: failReason };
    }

    const updated = await updateOrderByInvoice(invoiceNo, {
        status: 'PAID',
        delivery_status: 'DELIVERED',
        delivery_data: { license_key: keys[0], keys, provider: 'thanhub', expires_at: expiresAt, delivered_at: new Date().toISOString() },
    });
    const finalOrder = updated || (await getOrder(invoiceNo)) || order;
    sendOrderPaidEmail(finalOrder).catch(() => { });
    return { success: true, order: finalOrder };
}

export { randomUUID };

export type GatewayName = 'wijayapay' | 'autogopay';

export interface ChargeResult {
    success: boolean;
    message?: string;
    gateway?: GatewayName;
    method?: PaymentMethod;
    total?: number;
    fee?: number;
    paymentData?: Record<string, any>;
}

export async function getGatewayName(): Promise<GatewayName> {
    const s = await getSiteSettings();
    return s.payment_gateway_provider === 'autogopay' ? 'autogopay' : 'wijayapay'; // nilai lama (genspay) otomatis jadi autogopay
}

/** Daftar channel top-up. Di-cache 5 menit supaya tidak memanggil gateway tiap kali halaman dibuka. */
export async function listChannels(): Promise<PaymentMethod[]> {
    const gw = await getGatewayName();
    return memo(`channels:${gw}`, 5 * 60_000, async () => {
        const list = gw === 'wijayapay' ? await getWijayapayChannels() : getAutogopayPaymentChannels();
        return (list || []).filter((m) => m.is_active !== false);
    });
}

const QR_IMG = (data: string) => `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}`;

/**
 * Buat tagihan top-up ke gateway aktif. `amount` = saldo yang akan masuk.
 * Biaya gateway (fee) dibebankan ke pembeli sehingga saldo yang masuk = amount penuh.
 */
export async function createCharge(opts: { invoiceNo: string; refId: string; amount: number; paymentCode: string }): Promise<ChargeResult> {
    const settings = await getSiteSettings();
    const gw = await getGatewayName();
    const code = (opts.paymentCode || 'QRIS').toUpperCase();
    const channels = await listChannels();
    const method = channels.find((m) => m.code === code) || (code === 'QRIS' ? channels.find((m) => m.group_name === 'QRIS') : undefined);
    if (!method) return { success: false, message: 'Metode pembayaran tidak tersedia.' };

    const base = opts.amount;

    if (gw === 'autogopay') {
        const res = await createAutogopayTransaction({ order_id: opts.invoiceNo, amount: base });
        if (!res.success) return { success: false, message: res.message || 'Gagal membuat pembayaran.' };
        const d: any = res.data;
        const total = Number(d.total_payment) || base;
        return {
            success: true, gateway: gw, method, total, fee: Math.max(0, total - base),
            paymentData: {
                ref_id: opts.refId, invoice_no: opts.invoiceNo, total_bayar: total,
                qr_string: d.qris_string, qr_image: QR_IMG(d.qris_string), expired: d.expired_at,
                tutorial_pembayaran: method.tutorial_pembayaran, payment_image: method.image_url,
                payment_method: method.code, payment_name: method.name, gateway_provider: gw,
            },
        };
    }

    // WijayaPay
    const flat = Number(method.fee_amount || 0);
    const pct = Number(method.fee_percent || 0);
    let send = base;
    let fee = 0;
    if (method.type_fee === 'merchant') {
        if (pct > 0) {
            const f = 1 - pct / 100;
            send = f > 0 ? Math.ceil((base + flat) / f) : base + flat;
            fee = send - base;
        } else {
            fee = flat;
            send = base + fee;
        }
    } else {
        fee = flat + (pct > 0 ? Math.round((base * pct) / 100) : 0);
    }
    const res = await createWijayapayTransaction({ ref_id: opts.refId, code_payment: code, nominal: send });
    if (!res.success) return { success: false, message: res.message || 'Gagal membuat pembayaran.' };
    const d: any = res.data || {};
    const total = Number(d.total_bayar || base + fee);
    return {
        success: true, gateway: gw, method, total, fee: Math.max(0, total - base),
        paymentData: {
            ...d, invoice_no: opts.invoiceNo, ref_id: opts.refId,
            tutorial_pembayaran: method.tutorial_pembayaran || d.tutorial_pembayaran,
            payment_image: method.image_url || d.payment_image, gateway_provider: gw,
        },
    };
}

const SAFE_REF = /^[A-Za-z0-9_-]{3,100}$/;

/** Cari top-up lewat invoice (TOP-…) atau ref_id gateway (TPR-…). */
export async function findTopupByRef(ref: string): Promise<Topup | null> {
    if (!ref || !SAFE_REF.test(ref)) return null;
    const db = requireDb();
    const a = await db.from('topups').select('*').eq('invoice_no', ref).maybeSingle();
    if (a.data) return a.data as Topup;
    const b = await db.from('topups').select('*').eq('payment_data->>ref_id', ref).maybeSingle();
    return (b.data as Topup) || null;
}

export type CreditOutcome = 'credited' | 'already' | 'not_found' | 'amount_mismatch' | 'error';

/**
 * Kreditkan saldo untuk top-up yang SUDAH terkonfirmasi lunas oleh gateway.
 * Aman dipanggil berulang (idempotent di level database).
 */
export async function creditPaidTopup(ref: string, paidAmount?: number | null): Promise<CreditOutcome> {
    const t = await findTopupByRef(ref);
    if (!t) return 'not_found';
    if (t.status === 'PAID') return 'already';

    if (paidAmount !== undefined && paidAmount !== null && !Number.isNaN(Number(paidAmount))) {
        const p = Number(paidAmount);
        // Nominal yang dibayar harus sama dengan total tagihan atau nilai dasar top-up
        if (p !== Number(t.total_amount) && p !== Number(t.amount)) {
            console.error(`[topup] Nominal tidak cocok ${t.invoice_no}: dibayar=${p}, total=${t.total_amount}, amount=${t.amount} — TIDAK dikreditkan`);
            return 'amount_mismatch';
        }
    }
    try {
        const r = await settleTopup(t.invoice_no);
        return r.status === 'ALREADY_PAID' ? 'already' : r.ok ? 'credited' : 'error';
    } catch (e) {
        console.error('[topup] settle gagal:', e);
        return 'error';
    }
}

export type GatewayVerdict = 'paid' | 'expired' | 'pending';

/** Tanya status ke gateway (di-cache 15 detik per invoice agar polling tidak membanjiri gateway). */
export async function gatewayVerdict(gw: unknown, invoiceNo: string, refId?: string): Promise<GatewayVerdict> {
    if (gw !== 'autogopay' && gw !== 'wijayapay') return 'pending';
    return memo(`gwchk:${invoiceNo}`, 15_000, async (): Promise<GatewayVerdict> => {
        try {
            if (gw === 'autogopay') {
                const s = await checkAutogopayStatus(invoiceNo);
                return s?.status === 'paid' ? 'paid' : s?.status === 'expired' || s?.status === 'cancelled' ? 'expired' : 'pending';
            }
            const s: any = await checkPaymentStatus(refId || invoiceNo);
            const paid = s && (s.status_pembayaran === 'paid' || s.status === 'paid' || s.data?.status === 'paid' || s.data?.status_pembayaran === 'paid');
            return paid ? 'paid' : 'pending';
        } catch {
            return 'pending';
        }
    });
}

/** Cadangan webhook: tanya langsung ke gateway (dibatasi 1x / 15 detik per top-up). */
export async function reconcileWithGateway(t: Topup): Promise<Topup['status']> {
    if (t.status !== 'PENDING') return t.status;
    const gw = t.gateway || t.payment_data?.gateway_provider;
    const verdict = await gatewayVerdict(gw, t.invoice_no, t.payment_data?.ref_id);

    if (verdict === 'paid') {
        const out = await creditPaidTopup(t.invoice_no);
        return out === 'credited' || out === 'already' ? 'PAID' : t.status;
    }
    if (verdict === 'expired') {
        await markTopupStatus(t.invoice_no, 'EXPIRED');
        return 'EXPIRED';
    }
    return t.status;
}
