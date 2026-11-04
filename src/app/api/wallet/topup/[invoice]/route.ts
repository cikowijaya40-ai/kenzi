import { getTopupForUser } from '@/lib/wallet';
import { reconcileWithGateway } from '@/lib/wallet';
import { json, fail, requireUser } from '@/lib/api';
import { requireDb } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request, { params }: { params: { invoice: string } }) {
    const auth = await requireUser(req);
    if ('res' in auth) return auth.res;
    let t = await getTopupForUser(params.invoice, auth.user.id);
    if (!t) return fail('Tagihan tidak ditemukan.', 404);

    // Waktu kedaluwarsa lokal (15 menit) agar halaman tidak menunggu selamanya
    if (t.status === 'PENDING') {
        const status = await reconcileWithGateway(t);
        if (status !== t.status) t = (await getTopupForUser(params.invoice, auth.user.id)) || { ...t, status };
    }
    let balance = auth.user.balance;
    if (t.status === 'PAID') {
        const { data } = await requireDb().from('users').select('balance').eq('id', auth.user.id).maybeSingle();
        balance = Number(data?.balance ?? balance);
    }
    const { payment_data: pd, ...rest } = t as any;
    return json({
        success: true,
        topup: {
            ...rest,
            payment: {
                qr_image: pd?.qr_image, qr_string: pd?.qr_string, expired: pd?.expired,
                nomor_va: pd?.nomor_va, nomor_pembayaran: pd?.nomor_pembayaran,
                pay_address: pd?.pay_address, pay_amount: pd?.pay_amount, pay_currency: pd?.pay_currency,
                tutorial_pembayaran: pd?.tutorial_pembayaran,
            },
        },
        balance,
    });
}
