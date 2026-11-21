import { joinReseller } from '@/lib/reseller';
import { rateLimit } from '@/lib/security';
import { csrfBlock, fail, json, requireUser } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Daftar reseller: biaya join dipotong dari saldo (atomik). Sudah reseller → ditolak dengan pesan jelas. */
export async function POST(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    const auth = await requireUser(req);
    if ('res' in auth) return auth.res;
    const rl = await rateLimit(`rsljoin:${auth.user.id}`, 10, 600);
    if (!rl.allowed) return fail('Terlalu banyak percobaan. Coba lagi sebentar.', 429);

    const r = await joinReseller(auth.user);
    if (!r.success) {
        const status = r.code === 'INSUFFICIENT_BALANCE' ? 402 : r.code === 'ALREADY_RESELLER' ? 409 : r.code === 'ERROR' ? 500 : 400;
        return fail(r.message, status, { code: r.code });
    }
    return json({ success: true, balance: r.balance });
}
