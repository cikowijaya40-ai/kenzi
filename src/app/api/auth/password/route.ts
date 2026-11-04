import { NextResponse } from 'next/server';
import { requireDb } from '@/lib/supabase';
import { hashPassword, verifyPassword, validatePasswordStrength, rateLimit } from '@/lib/security';
import { attachUserSession } from '@/lib/security';
import { fail, csrfBlock, readJson, requireUser } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    const auth = await requireUser(req);
    if ('res' in auth) return auth.res;
    try {
        const rl = await rateLimit(`pw:${auth.user.id}`, 5, 900);
        if (!rl.allowed) return fail('Terlalu banyak percobaan. Coba lagi nanti.', 429);

        const b = await readJson(req);
        const current = String(b.currentPassword || '');
        const next = String(b.newPassword || '');
        const weak = validatePasswordStrength(next);
        if (weak) return fail(weak);

        const db = requireDb();
        const { data } = await db.from('users').select('password_hash, token_version').eq('id', auth.user.id).single();
        if (!data || !(await verifyPassword(current, data.password_hash))) return fail('Password lama salah.', 401);

        const version = (data.token_version || 0) + 1; // mencabut semua sesi lain
        await db.from('users').update({ password_hash: await hashPassword(next), token_version: version, init_cred: null }).eq('id', auth.user.id);

        const res = NextResponse.json({ success: true, message: 'Password berhasil diganti.' }, { headers: { 'Cache-Control': 'no-store' } });
        attachUserSession(res, { id: auth.user.id, token_version: version });
        return res;
    } catch (e: any) {
        return fail(e.message || 'Gagal mengganti password.', 500);
    }
}
