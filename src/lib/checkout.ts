import { getOrder, requireDb } from './supabase';
import { createCharge, deliverLicense, gatewayVerdict } from './wallet';
import { sendPlainMail } from './email';
import { getSiteSettings } from './settings';
import { readInitCred } from './guest';
import { thLiveCheck } from './thanhub';
import type { Order } from './types';

const rid = () => Math.random().toString(36).slice(2, 7).toUpperCase();

/** Referensi pesanan: invoice INV-… (AutoGopay) atau ref_id ORD-… (WijayaPay). Top up memakai TOP-/TPR-. */
export const isOrderRef = (ref: string) => /^(INV|ORD)-/.test(ref || '');

/* ───────── BUAT PESANAN + TAGIHAN QRIS LANGSUNG ───────── */
export interface QrisOrderInput { productSlug: string; itemSku: string; gameId?: string; zoneId?: string; whatsapp?: string }

export async function createQrisOrder(user: { id: string; email: string }, input: QrisOrderInput) {
    const db = requireDb();

    // Harga & ketersediaan dibaca dari database (server-authoritative), tidak pernah dari klien.
    const { data: pr } = await db.from('products').select('slug, name, is_active').eq('slug', input.productSlug).maybeSingle();
    const { data: it } = await db.from('product_items').select('sku, name, price, is_active, in_stock, stock').eq('product_slug', input.productSlug).eq('sku', input.itemSku).maybeSingle();
    const available = pr && it && pr.is_active !== false && it.is_active !== false && it.in_stock !== false && Number(it.stock ?? 999) > 0;
    const price = it ? Math.round(Number(it.price)) : 0;
    if (!available || price <= 0) return { success: false as const, code: 'ITEM_UNAVAILABLE', message: 'Produk/varian tidak tersedia atau stok habis.' };

    // Stok & harga LIVE di Thanhub dicek tepat sebelum QR dibuat → pembeli tidak sempat membayar varian yang sudah habis.
    const live = await thLiveCheck(it!.sku, price);
    if (!live.ok) return { success: false as const, code: 'ITEM_UNAVAILABLE', message: live.message };

    const stamp = Date.now().toString().slice(-8);
    const invoiceNo = `INV-${stamp}-${rid()}`;
    const refId = `ORD-${stamp}${rid()}`;

    const charge = await createCharge({ invoiceNo, refId, amount: price, paymentCode: 'QRIS' });
    if (!charge.success) return { success: false as const, code: 'GATEWAY', message: charge.message || 'Gagal membuat QRIS. Coba lagi sebentar.' };

    const row = {
        invoice_no: invoiceNo, ref_id: refId,
        product_slug: pr!.slug, product_name: pr!.name, item_sku: it!.sku, item_name: it!.name,
        user_id_game: input.gameId || '-', zone_id: input.zoneId || null,
        user_whatsapp: input.whatsapp || '-', customer_email: user.email,
        amount: price, fee: charge.fee || 0, total_amount: charge.total || price,
        payment_method: charge.method?.code || 'QRIS', payment_name: charge.method?.name || 'QRIS',
        payment_data: { ...(charge.paymentData || {}), gateway_provider: charge.gateway },
        status: 'PENDING', delivery_status: 'PENDING', user_id: user.id,
    };
    const { error } = await db.from('orders').insert(row);
    if (error) {
        console.error('[createQrisOrder]', error.message);
        return { success: false as const, code: 'ERROR', message: 'Gagal menyimpan pesanan. Coba lagi.' };
    }
    return { success: true as const, invoice_no: invoiceNo };
}

/* ───────── PELUNASAN (webhook / polling) ───────── */
export async function findOrderByRef(ref: string): Promise<Order | null> {
    if (!ref || !isOrderRef(ref)) return null;
    return getOrder(ref);
}

export type OrderOutcome = 'delivered' | 'delivery_failed' | 'already' | 'not_found' | 'amount_mismatch' | 'error';

/**
 * Dipanggil setelah gateway MENGONFIRMASI lunas. Idempotent: hanya pemanggil pertama yang mengirim lisensi
 * (mark_order_paid di database memakai row lock). Aman dipanggil berulang oleh webhook, polling, maupun admin.
 */
export async function settleOrderPayment(ref: string, paidAmount?: number | null): Promise<OrderOutcome> {
    const o = await findOrderByRef(ref);
    if (!o || o.payment_method === 'SALDO') return 'not_found';
    if (o.status === 'PAID') return 'already';

    if (paidAmount !== undefined && paidAmount !== null && !Number.isNaN(Number(paidAmount))) {
        const p = Number(paidAmount);
        if (p !== Number(o.total_amount) && p !== Number(o.amount)) {
            console.error(`[order] Nominal tidak cocok ${o.invoice_no}: dibayar=${p}, total=${o.total_amount}, harga=${o.amount} — TIDAK diproses`);
            return 'amount_mismatch';
        }
    }
    try {
        const { data, error } = await requireDb().rpc('mark_order_paid', { p_invoice: o.invoice_no });
        if (error) throw new Error(error.message);
        const r: any = Array.isArray(data) ? data[0] : data;
        if (!r?.transitioned) return r?.status === 'ALREADY_PAID' ? 'already' : 'error';

        const paid = (await getOrder(o.invoice_no)) || { ...o, status: 'PAID' as const };
        const d = await deliverLicense(paid);
        if (!d.success) return 'delivery_failed';
        sendAccountEmailIfNew(d.order).catch(() => { });
        return 'delivered';
    } catch (e) {
        console.error('[order] settle gagal:', e);
        return 'error';
    }
}

export async function markOrderExpired(ref: string) {
    const o = await findOrderByRef(ref);
    if (o) await requireDb().from('orders').update({ status: 'EXPIRED', updated_at: new Date().toISOString() }).eq('invoice_no', o.invoice_no).eq('status', 'PENDING');
}

/** Cadangan webhook: tanya gateway saat halaman pesanan di-polling. */
export async function reconcileOrder(o: Order): Promise<Order> {
    if (o.status !== 'PENDING' || o.payment_method === 'SALDO') return o;
    const verdict = await gatewayVerdict(o.payment_data?.gateway_provider, o.invoice_no, o.ref_id);
    if (verdict === 'paid') await settleOrderPayment(o.invoice_no);
    else if (verdict === 'expired') await markOrderExpired(o.invoice_no);
    else return o;
    return (await getOrder(o.invoice_no)) || o;
}

/* ───────── EMAIL AKUN OTOMATIS ───────── */
async function sendAccountEmailIfNew(order: Order) {
    if (!order.user_id || !order.customer_email) return;
    const { data: u } = await requireDb().from('users').select('auto_created, init_cred, username').eq('id', order.user_id).maybeSingle();
    if (!u?.auto_created) return;
    const cred = readInitCred(u.init_cred);
    if (!cred) return;
    const site = (await getSiteSettings()).site_name || 'Store';
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #ddd;border-radius:12px">
      <h2 style="margin:0 0 8px">Akun ${esc(site)} kamu sudah dibuat</h2>
      <p style="color:#444">Terima kasih sudah berbelanja. Kami otomatis membuatkan akun supaya kamu bisa melihat lisensi & riwayat pesanan kapan saja.</p>
      <table style="width:100%;font-size:15px;margin:16px 0;background:#f6f6f6;border-radius:8px;padding:12px">
        <tr><td style="color:#666">Username</td><td style="text-align:right"><b>${esc(cred.username)}</b></td></tr>
        <tr><td style="color:#666">Password</td><td style="text-align:right"><b>${esc(cred.password)}</b></td></tr>
      </table>
      <p style="color:#444;font-size:13px">Demi keamanan, silakan <b>ganti password (dan username jika mau)</b> di menu Dashboard → Akun setelah login.</p>
    </div>`;
    await sendPlainMail(order.customer_email, `Akun ${site} kamu & detail login`, html);
}
