import { getOrder, requireDb } from '@/lib/supabase';
import { json, fail, requireUser } from '@/lib/api';
import { reconcileOrder } from '@/lib/checkout';
import { readInitCred } from '@/lib/guest';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Detail pesanan + lisensi (+ QR bila belum dibayar). HANYA pemilik pesanan yang boleh melihat. */
export async function GET(req: Request, { params }: { params: { invoice: string } }) {
    const auth = await requireUser(req);
    if ('res' in auth) return auth.res;
    let o: any = await getOrder(params.invoice);
    if (!o || o.user_id !== auth.user.id) return fail('Pesanan tidak ditemukan.', 404);

    // Pesanan QRIS yang masih menunggu: cek ke gateway (cadangan bila webhook telat) — sekaligus mengirim lisensi bila sudah lunas
    if (o.status === 'PENDING' && o.payment_method !== 'SALDO') o = await reconcileOrder(o);

    // Kredensial awal akun otomatis — tampil sampai user mengganti password/username
    let account: { username: string; password: string } | null = null;
    if (o.delivery_status === 'DELIVERED') {
        const { data: u } = await requireDb().from('users').select('auto_created, init_cred').eq('id', auth.user.id).maybeSingle();
        if (u?.auto_created) account = readInitCred(u.init_cred);
    }

    const pd = o.payment_data || {};
    const pending = o.status === 'PENDING' && o.payment_method !== 'SALDO';
    return json({
        success: true,
        order: {
            invoice_no: o.invoice_no, product_name: o.product_name, product_slug: o.product_slug, item_name: o.item_name,
            amount: Number(o.amount), fee: Number(o.fee || 0), total_amount: Number(o.total_amount), status: o.status, delivery_status: o.delivery_status,
            payment_method: o.payment_method, payment_name: o.payment_name, created_at: o.created_at, user_id_game: o.user_id_game,
            keys: o.delivery_data?.keys?.length ? o.delivery_data.keys : (o.delivery_data?.license_key ? [o.delivery_data.license_key] : []),
            message: o.delivery_data?.refund_reason ? `Dibatalkan & dana dikembalikan ke saldo akun: ${o.delivery_data.refund_reason}` : null,
            payment: pending ? {
                qr_image: pd.qr_image, qr_string: pd.qr_string, expired: pd.expired,
                nomor_va: pd.nomor_va, nomor_pembayaran: pd.nomor_pembayaran, tutorial_pembayaran: pd.tutorial_pembayaran,
            } : null,
            account,
        },
    });
}
