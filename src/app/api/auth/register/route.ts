import { NextResponse } from 'next/server';
import { requireDb } from '@/lib/supabase';
import { hashPassword, validatePasswordStrength, rateLimit, getClientIp } from '@/lib/security';
import { attachUserSession } from '@/lib/security';
import { USERNAME_RE, EMAIL_RE, sanitizeText } from '@/lib/users';
import { fail, csrfBlock, readJson } from '@/lib/api';
import { verifyTurnstile } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    try {
        const ip = getClientIp(req);
        const rl = await rateLimit(`reg:${ip}`, 5, 3600);
        if (!rl.allowed) return fail('Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti.', 429, { retryAfter: rl.retryAfter });

        const b = await readJson(req);
        if (!(await verifyTurnstile(b.turnstileToken, getClientIp(req)))) return fail('Verifikasi keamanan (Turnstile) gagal. Muat ulang & coba lagi.', 400);
        const username = sanitizeText(b.username, 20);
        const email = sanitizeText(b.email, 120).toLowerCase();
        const password = String(b.password || '');
        const whatsapp = sanitizeText(b.whatsapp, 20).replace(/[^\d+]/g, '');

        if (!USERNAME_RE.test(username)) return fail('Username 3–20 karakter, hanya huruf, angka, dan underscore.');
        if (!EMAIL_RE.test(email)) return fail('Format email tidak valid.');
        const weak = validatePasswordStrength(password);
        if (weak) return fail(weak);

        const db = requireDb();
        const { data: dup } = await db.from('users').select('id').or(`username.ilike.${username},email.ilike.${email}`).limit(1);
        if (dup && dup.length) return fail('Username atau email sudah terdaftar.', 409);

        const password_hash = await hashPassword(password);
        const { data, error } = await db
            .from('users')
            .insert({ username, email, password_hash, whatsapp: whatsapp || null, last_login_at: new Date().toISOString() })
            .select('id, username, email, balance, token_version')
            .single();
        if (error) {
            if (/duplicate|unique/i.test(error.message)) return fail('Username atau email sudah terdaftar.', 409);
            throw new Error(error.message);
        }

        const res = NextResponse.json({ success: true, user: { id: data.id, username: data.username, email: data.email, balance: 0 } }, { headers: { 'Cache-Control': 'no-store' } });
        attachUserSession(res, data);
        return res;
    } catch (e: any) {
        return fail(e.message || 'Gagal mendaftar.', 500);
    }
}
