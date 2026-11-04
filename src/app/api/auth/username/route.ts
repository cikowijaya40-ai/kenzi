import { requireDb } from '@/lib/supabase';
import { verifyPassword, rateLimit } from '@/lib/security';
import { USERNAME_RE, sanitizeText } from '@/lib/users';
import { fail, json, csrfBlock, readJson, requireUser } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Ganti username. Wajib konfirmasi password saat ini. */
export async function POST(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    const auth = await requireUser(req);
    if ('res' in auth) return auth.res;
    try {
        const rl = await rateLimit(`un:${auth.user.id}`, 5, 900);
        if (!rl.allowed) return fail('Terlalu banyak percobaan. Coba lagi nanti.', 429);

        const b = await readJson(req);
        const username = sanitizeText(b.username, 20);
        if (!USERNAME_RE.test(username)) return fail('Username 3–20 karakter, hanya huruf, angka, dan underscore.');
        if (username === auth.user.username) return fail('Username baru sama dengan yang sekarang.');

        const db = requireDb();
        const { data: me } = await db.from('users').select('password_hash').eq('id', auth.user.id).single();
        if (!me || !(await verifyPassword(String(b.currentPassword || ''), me.password_hash))) return fail('Password salah.', 401);

        const { data: dup } = await db.from('users').select('id').ilike('username', username.replace(/[%_\\]/g, (m) => '\\' + m)).neq('id', auth.user.id).limit(1);
        if (dup && dup.length) return fail('Username sudah dipakai.', 409);

        const { error } = await db.from('users').update({ username, init_cred: null }).eq('id', auth.user.id);
        if (error) {
            if (/duplicate|unique/i.test(error.message)) return fail('Username sudah dipakai.', 409);
            throw new Error(error.message);
        }
        return json({ success: true, message: 'Username diganti.', username });
    } catch (e: any) {
        return fail(e.message || 'Gagal mengganti username.', 500);
    }
}
