import { requireDb } from '@/lib/supabase';
import { hashPassword, validatePasswordStrength, rateLimit, getClientIp, sha256, safeEqual } from '@/lib/security';
import { ADMIN_USERNAME_RE, getFirstAdmin } from '@/lib/users';
import { bust } from '@/lib/cache';
import { fail, json, csrfBlock, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Terapkan reset admin. Dua cara yang sah:
 *  A) { token, newPassword, newUsername? }       → token dari email (sekali pakai, 30 menit)
 *  B) { recoveryKey, newPassword, newUsername? }  → Kunci Pemulihan (env ADMIN_RECOVERY_KEY) bila email tidak tersedia
 */
export async function POST(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    try {
        const ip = getClientIp(req);
        const rl = await rateLimit(`adm:reset:${ip}`, 6, 3600);
        if (!rl.allowed) return fail('Terlalu banyak percobaan. Coba lagi nanti.', 429);

        const b = await readJson(req);
        const newPassword = String(b.newPassword || '');
        const newUsername = String(b.newUsername || '').trim();
        const weak = validatePasswordStrength(newPassword);
        if (weak) return fail(weak);
        if (newUsername && !ADMIN_USERNAME_RE.test(newUsername)) return fail('Username 3–32 karakter (huruf, angka, _ . -).');

        const db = requireDb();
        let adminId = '';
        let requestId = '';

        if (b.token) {
            const { data } = await db.from('admin_reset_requests').select('id, admin_id, expires_at, used_at').eq('token_hash', sha256(String(b.token))).maybeSingle();
            if (!data || data.used_at || new Date(data.expires_at).getTime() < Date.now()) return fail('Tautan reset tidak valid atau sudah kedaluwarsa.', 400);
            adminId = data.admin_id;
            requestId = data.id;
        } else if (b.recoveryKey) {
            const key = process.env.ADMIN_RECOVERY_KEY || '';
            if (key.length < 16 || !safeEqual(String(b.recoveryKey), key)) return fail('Kunci pemulihan salah.', 401);
            const first = await getFirstAdmin();
            if (!first) {
                const { data, error } = await db.from('admin_users').insert({ username: newUsername || 'admin', password_hash: await hashPassword(newPassword) }).select('id').single();
                if (error) return fail(error.message, 400);
                return json({ success: true, message: 'Admin dibuat. Silakan login.', id: data.id });
            }
            adminId = first.id;
        } else {
            return fail('Sertakan token reset atau kunci pemulihan.');
        }

        const { data: cur } = await db.from('admin_users').select('token_version').eq('id', adminId).single();
        const update: Record<string, any> = {
            password_hash: await hashPassword(newPassword),
            token_version: (cur?.token_version || 0) + 1, // paksa semua sesi lama keluar
            updated_at: new Date().toISOString(),
        };
        if (newUsername) update.username = newUsername;
        const { error } = await db.from('admin_users').update(update).eq('id', adminId);
        if (error) return fail(/duplicate|unique/i.test(error.message) ? 'Username sudah dipakai.' : error.message, 400);
        if (requestId) await db.from('admin_reset_requests').update({ used_at: new Date().toISOString() }).eq('id', requestId);

        bust(`admin:${adminId}`);
        return json({ success: true, message: 'Akun admin berhasil diatur ulang. Silakan login.' });
    } catch (e: any) {
        return fail('Gagal mereset akun admin.', 500);
    }
}
