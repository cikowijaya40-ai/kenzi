import { getOrdersByUser } from '@/lib/supabase';
import { listLedger, listTopups } from '@/lib/wallet';
import { json, requireUser } from '@/lib/api';
import { requireDb } from '@/lib/supabase';
import { readInitCred } from '@/lib/guest';

export const dynamic = 'force-dynamic';

/** Satu request untuk seluruh dashboard (hemat invocation): saldo, mutasi, top up, pesanan + lisensi. */
export async function GET(req: Request) {
    const auth = await requireUser(req);
    if ('res' in auth) return auth.res;
    const [{ data: flags }, ledger, topups, orders] = await Promise.all([
        requireDb().from('users').select('auto_created, init_cred').eq('id', auth.user.id).maybeSingle(),
        listLedger(auth.user.id, 20),
        listTopups(auth.user.id, 10),
        getOrdersByUser(auth.user.id, 20),
    ]);
    return json({
        success: true,
        user: auth.user,
        auto_created: Boolean(flags?.auto_created),
        init_cred: flags?.auto_created ? readInitCred(flags?.init_cred) : null,
        ledger,
        topups,
        orders: orders.map((o: any) => ({
            invoice_no: o.invoice_no, product_name: o.product_name, item_name: o.item_name, total_amount: Number(o.total_amount),
            status: o.status, delivery_status: o.delivery_status, created_at: o.created_at,
            has_license: Boolean(o.delivery_data?.license_key),
        })),
    });
}
