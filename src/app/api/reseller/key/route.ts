import { createApiKey, getResellerState, revokeApiKey } from '@/lib/reseller';
import { rateLimit } from '@/lib/security';
import { csrfBlock, fail, json, readJson, requireUser } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * POST { action: 'create' }  → buat / ganti API key. Key utuh dikembalikan SEKALI di respons ini (yang tersimpan hanya hash-nya).
 * POST { action: 'revoke' }  → cabut key.
 */
export async function POST(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    const auth = await requireUser(req);
    if ('res' in auth) return auth.res;
    try {
        const rl = await rateLimit(`rslkey:${auth.user.id}`, 10, 600);
        if (!rl.allowed) return fail('Terlalu banyak percobaan. Coba lagi sebentar.', 429);

        const st = await getResellerState(auth.user.id);
        if (!st.isReseller) return fail('Kamu belum menjadi reseller.', 403);
        if (st.disabled) return fail('Akun reseller kamu sedang dinonaktifkan admin.', 403);

        const b = await readJson(req, 2000);
        if (b.action === 'create') {
            const r = await createApiKey(auth.user.id);
            if (!r.ok) return fail(r.message, 400);
            return json({ success: true, key: r.key, keyPrefix: r.prefix });
        }
        if (b.action === 'revoke') {
            const ok = await revokeApiKey(auth.user.id);
            return ok ? json({ success: true }) : fail('Gagal mencabut key. Coba lagi.', 500);
        }
        return fail('Aksi tidak dikenal.');
    } catch (e: any) {
        return fail(e?.message || 'Terjadi kesalahan.', 400);
    }
}
