import { createTopup } from '@/lib/wallet';
import { rateLimit } from '@/lib/security';
import { fail, json, csrfBlock, readJson, requireUser } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    const auth = await requireUser(req);
    if ('res' in auth) return auth.res;
    try {
        const rl = await rateLimit(`topup:${auth.user.id}`, 10, 3600);
        if (!rl.allowed) return fail('Terlalu banyak permintaan top up. Coba lagi nanti.', 429);

        const b = await readJson(req);
        const amount = Number(b.amount);
        const code = String(b.paymentCode || 'QRIS').slice(0, 30);
        const r = await createTopup(auth.user, amount, code);
        if (!r.success) return fail(r.message, 400);
        return json({ success: true, invoice_no: r.topup.invoice_no });
    } catch (e: any) {
        console.error('[topup create]', e);
        return fail('Gagal membuat tagihan top up.', 500);
    }
}
