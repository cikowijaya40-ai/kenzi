import { requireDb } from '@/lib/supabase';
import { rateLimit, getClientIp, randomToken, sha256 } from '@/lib/security';
import { findAdminByUsername, ensureBootstrapAdmin } from '@/lib/users';
import { sendPlainMail } from '@/lib/email';
import { fail, json, csrfBlock, readJson } from '@/lib/api';
import { verifyTurnstile } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * REQUEST reset password/username admin.
 * Respons SELALU sama (tidak membocorkan apakah username ada). Jika admin punya email terdaftar & SMTP aktif,
 * tautan sekali-pakai (berlaku 30 menit) dikirim ke email tersebut.
 */
export async function POST(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    try {
        const ip = getClientIp(req);
        const rl = await rateLimit(`adm:forgot:${ip}`, 3, 3600);
        if (!rl.allowed) return fail('Terlalu banyak permintaan. Coba lagi dalam 1 jam.', 429);

        const b = await readJson(req);
        if (!(await verifyTurnstile(b.turnstileToken, getClientIp(req)))) return fail('Verifikasi keamanan (Turnstile) gagal. Muat ulang & coba lagi.', 400);
        const username = String(b.username || '').trim().slice(0, 64);
        const generic = { success: true, message: 'Jika akun ditemukan dan memiliki email terdaftar, tautan reset sudah dikirim (berlaku 30 menit). Tidak menerima email? Gunakan Kunci Pemulihan (ADMIN_RECOVERY_KEY).' };
        if (!username) return json(generic);

        await ensureBootstrapAdmin();
        const admin = await findAdminByUsername(username);
        if (admin?.email) {
            const token = randomToken(32);
            await requireDb().from('admin_reset_requests').insert({
                admin_id: admin.id,
                token_hash: sha256(token),
                expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
                ip,
            });
            const base = (process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get('host')}`).replace(/\/+$/, '');
            const link = `${base}/admin/forgot?token=${encodeURIComponent(token)}`;
            await sendPlainMail(
                admin.email,
                'Reset akun admin',
                `<p>Ada permintaan reset akun admin untuk <b>${admin.username.replace(/[<>&]/g, '')}</b>.</p><p><a href="${link}">Klik di sini untuk mengatur ulang username/password</a> (berlaku 30 menit, sekali pakai).</p><p>Jika bukan Anda, abaikan email ini.</p>`
            );
        }
        return json(generic);
    } catch (e: any) {
        return fail('Gagal memproses permintaan.', 500);
    }
}
