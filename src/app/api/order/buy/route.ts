import { buyWithBalance } from '@/lib/wallet';
import { rateLimit } from '@/lib/security';
import { sanitizeText } from '@/lib/users';
import { fail, json, csrfBlock, readJson, requireUser } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    const auth = await requireUser(req);
    if ('res' in auth) return auth.res;
    try {
        const rl = await rateLimit(`buy:${auth.user.id}`, 15, 600);
        if (!rl.allowed) return fail('Terlalu banyak transaksi. Coba lagi sebentar.', 429);

        const b = await readJson(req);
        const productSlug = sanitizeText(b.productSlug, 100);
        const itemSku = sanitizeText(b.itemSku, 100);
        if (!productSlug || !itemSku) return fail('Pilih produk dan durasi dulu.');

        const r = await buyWithBalance(auth.user, {
            productSlug,
            itemSku,
            gameId: sanitizeText(b.gameId, 100),
            zoneId: sanitizeText(b.zoneId, 50),
            whatsapp: sanitizeText(b.whatsapp, 20).replace(/[^\d+]/g, ''),
        });
        if (!r.success) {
            const status = r.code === 'INSUFFICIENT_BALANCE' ? 402 : r.code === 'ERROR' ? 500 : 400;
            return fail(r.message, status, { code: r.code });
        }
        return json({ success: true, invoice_no: r.invoice_no, balance: r.balance });
    } catch (e: any) {
        console.error('[buy]', e);
        return fail('Terjadi kesalahan saat memproses pesanan.', 500);
    }
}
