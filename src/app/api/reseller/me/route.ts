import { getResellerState } from '@/lib/reseller';
import { json, requireUser } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Status reseller milik user yang login (untuk halaman /reseller dan /reseller/api). Tidak pernah memuat key utuh. */
export async function GET(req: Request) {
    const auth = await requireUser(req);
    if ('res' in auth) return auth.res;
    return json({ success: true, ...(await getResellerState(auth.user.id)) });
}
