import { getUserFromRequest } from '@/lib/security';
import { json } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Dipanggil header untuk menampilkan nama & saldo. Ringan: 1 query by primary key. */
export async function GET(req: Request) {
    const user = await getUserFromRequest(req).catch(() => null);
    return json({ success: true, user: user ? { id: user.id, username: user.username, email: user.email, balance: user.balance } : null });
}
