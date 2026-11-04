import { NextResponse } from 'next/server';
import { requireDb } from '@/lib/supabase';
import { verifyPassword, rateLimit, getClientIp, DUMMY_HASH } from '@/lib/security';
import { attachUserSession } from '@/lib/security';
import { findUserForLogin, sanitizeText } from '@/lib/users';
import { fail, csrfBlock, readJson } from '@/lib/api';
import { verifyTurnstile } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    try {
        const b = await readJson(req);
        if (!(await verifyTurnstile(b.turnstileToken, getClientIp(req)))) return fail('Verifikasi keamanan (Turnstile) gagal. Muat ulang & coba lagi.', 400);
        const identifier = sanitizeText(b.identifier ?? b.username ?? b.email, 255).toLowerCase();
        const password = String(b.password || '');
        if (!identifier || !password) return fail('Isi username/email dan password.');

        const ip = getClientIp(req);
        // Batas per IP (cegah menebak banyak akun) DAN per akun (cegah menebak 1 akun dari banyak IP)
        const [a, c] = await Promise.all([rateLimit(`login:ip:${ip}`, 20, 600), rateLimit(`login:id:${identifier}`, 8, 600)]);
        if (!a.allowed || !c.allowed) {
            return fail('Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.', 429, { retryAfter: Math.max(a.retryAfter, c.retryAfter) });
        }

        const user = await findUserForLogin(identifier);
        // Selalu hitung hash (walau user tidak ada) agar waktu respons seragam
        const ok = await verifyPassword(password, user?.password_hash || DUMMY_HASH);
        if (!user || !ok) return fail('Username/email atau password salah.', 401);
        if ((user as any).is_banned) return fail('Akun ini dinonaktifkan. Hubungi admin.', 403);

        await requireDb().from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

        const res = NextResponse.json({ success: true, user: { id: user.id, username: user.username, email: user.email, balance: Number(user.balance) } }, { headers: { 'Cache-Control': 'no-store' } });
        attachUserSession(res, user as any);
        return res;
    } catch (e: any) {
        return fail(e.message || 'Gagal login.', 500);
    }
}
