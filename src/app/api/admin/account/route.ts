import { NextResponse } from 'next/server';
import { requireDb } from '@/lib/supabase';
import { hashPassword, verifyPassword, validatePasswordStrength, rateLimit } from '@/lib/security';
import { attachAdminSession, getAdminFromRequest } from '@/lib/security';
import { ADMIN_USERNAME_RE } from '@/lib/users';
import { bust } from '@/lib/cache';
import { fail, csrfBlock, readJson } from '@/lib/api';
import { EMAIL_RE } from '@/lib/users';

export const dynamic = 'force-dynamic';

/** Ganti username / password / email admin. Wajib konfirmasi password saat ini. */
export async function POST(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    const me = await getAdminFromRequest(req).catch(() => null);
    if (!me) return fail('Unauthorized', 401);
    try {
        const rl = await rateLimit(`adm:acct:${me.id}`, 6, 900);
        if (!rl.allowed) return fail('Terlalu banyak percobaan. Coba lagi nanti.', 429);

        const b = await readJson(req);
        const db = requireDb();
        const { data: row } = await db.from('admin_users').select('*').eq('id', me.id).single();
        if (!row || !(await verifyPassword(String(b.currentPassword || ''), row.password_hash))) return fail('Password saat ini salah.', 401);

        const update: Record<string, any> = { updated_at: new Date().toISOString() };
        const newUsername = String(b.newUsername || '').trim();
        const newPassword = String(b.newPassword || '');
        const newEmail = String(b.email ?? '').trim().toLowerCase();

        if (newUsername && newUsername !== row.username) {
            if (!ADMIN_USERNAME_RE.test(newUsername)) return fail('Username 3–32 karakter (huruf, angka, _ . -).');
            update.username = newUsername;
        }
        if (newPassword) {
            const weak = validatePasswordStrength(newPassword);
            if (weak) return fail(weak);
            update.password_hash = await hashPassword(newPassword);
            update.token_version = (row.token_version || 0) + 1; // semua sesi admin lain otomatis keluar
        }
        if (b.email !== undefined) {
            if (newEmail && !EMAIL_RE.test(newEmail)) return fail('Format email tidak valid.');
            update.email = newEmail || null;
        }
        if (Object.keys(update).length === 1) return fail('Tidak ada perubahan.');

        const { data, error } = await db.from('admin_users').update(update).eq('id', me.id).select('id, username, token_version').single();
        if (error) return fail(/duplicate|unique/i.test(error.message) ? 'Username sudah dipakai.' : error.message, 400);

        bust(`admin:${me.id}`);
        const res = NextResponse.json({ success: true, message: 'Akun admin diperbarui.', username: data.username }, { headers: { 'Cache-Control': 'no-store' } });
        attachAdminSession(res, data);
        return res;
    } catch (e: any) {
        return fail(e.message || 'Gagal memperbarui akun.', 500);
    }
}

export async function GET(req: Request) {
    const me = await getAdminFromRequest(req).catch(() => null);
    if (!me) return fail('Unauthorized', 401);
    return NextResponse.json({ success: true, username: me.username, email: me.email }, { headers: { 'Cache-Control': 'no-store' } });
}
