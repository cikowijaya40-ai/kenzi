import { NextResponse } from 'next/server';
import { verifyPassword, rateLimit, getClientIp, DUMMY_HASH } from '@/lib/security';
import { attachAdminSession, clearAdminSession, getAdminFromRequest } from '@/lib/security';
import { ensureBootstrapAdmin, findAdminByUsername } from '@/lib/users';
import { fail, csrfBlock, readJson } from '@/lib/api';
import { verifyTurnstile } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const admin = await getAdminFromRequest(req).catch(() => null);
    return NextResponse.json({ authenticated: Boolean(admin), username: admin?.username || null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    try {
        const b = await readJson(req);
        if (!(await verifyTurnstile(b.turnstileToken, getClientIp(req)))) return fail('Verifikasi keamanan (Turnstile) gagal. Muat ulang & coba lagi.', 400);
        const username = String(b.username || '').trim().slice(0, 64);
        const password = String(b.password || '');
        if (!username || !password) return fail('Isi username dan password admin.');

        const ip = getClientIp(req);
        const [a, c] = await Promise.all([rateLimit(`adm:ip:${ip}`, 10, 900), rateLimit(`adm:u:${username.toLowerCase()}`, 5, 900)]);
        if (!a.allowed || !c.allowed) return fail('Terlalu banyak percobaan login admin. Tunggu beberapa menit.', 429, { retryAfter: Math.max(a.retryAfter, c.retryAfter) });

        await ensureBootstrapAdmin();
        const admin = await findAdminByUsername(username);
        const ok = await verifyPassword(password, admin?.password_hash || DUMMY_HASH);
        if (!admin || !ok) return fail('Username atau password admin salah.', 401);

        const res = NextResponse.json({ success: true, message: 'Login admin berhasil', username: admin.username }, { headers: { 'Cache-Control': 'no-store' } });
        attachAdminSession(res, admin); // cookie httpOnly — token tidak diberikan ke JavaScript
        return res;
    } catch (e: any) {
        return fail(e.message || 'Gagal login admin.', 500);
    }
}

export async function DELETE(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    const res = NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
    clearAdminSession(res);
    return res;
}
