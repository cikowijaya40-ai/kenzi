import { getPortal } from '@/lib/reseller';
import { fail, json, requireUser } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Data portal reseller (profil, saldo, statistik, riwayat, mutasi, katalog harga reseller, top seller). */
export async function GET(req: Request) {
    const auth = await requireUser(req);
    if ('res' in auth) return auth.res;
    try {
        return json({ success: true, ...(await getPortal(auth.user)) });
    } catch (e: any) {
        console.error('[reseller/portal]', e?.message || e);
        return fail('Gagal memuat portal reseller. Coba lagi.', 500);
    }
}
