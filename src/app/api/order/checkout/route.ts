import { NextResponse } from 'next/server';
import { createQrisOrder } from '@/lib/checkout';
import { createAutoUser, deleteAutoUser, emailIsRegistered } from '@/lib/guest';
import { attachUserSession, getClientIp, getUserFromRequest, rateLimit, verifyTurnstile } from '@/lib/security';
import { EMAIL_RE, sanitizeText } from '@/lib/users';
import { csrfBlock, fail, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Checkout QRIS langsung. Tidak wajib login:
 *  - Sudah login  → pesanan dibuat di akunnya.
 *  - Belum login  → akun dibuat otomatis dari email pembeli, pembeli otomatis masuk (cookie sesi),
 *                   lalu QR langsung tampil di halaman pesanan. Email yang sudah terdaftar diminta login dulu
 *                   (agar orang lain tidak bisa masuk ke akun yang bukan miliknya).
 */
export async function POST(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    let createdUserId: string | null = null;
    try {
        const ip = getClientIp(req);
        const b = await readJson(req);

        const productSlug = sanitizeText(b.productSlug, 100);
        const itemSku = sanitizeText(b.itemSku, 100);
        if (!productSlug || !itemSku) return fail('Pilih produk dan durasi dulu.');

        const existing = await getUserFromRequest(req).catch(() => null);
        let owner: { id: string; email: string; token_version?: number };
        let isNew = false;

        if (existing) {
            const rl = await rateLimit(`co:u:${existing.id}`, 15, 600);
            if (!rl.allowed) return fail('Terlalu banyak transaksi. Coba lagi sebentar.', 429);
            owner = { id: existing.id, email: existing.email };
        } else {
            const rl = await rateLimit(`co:ip:${ip}`, 8, 900);
            if (!rl.allowed) return fail('Terlalu banyak percobaan dari jaringan ini. Coba lagi beberapa menit lagi.', 429, { retryAfter: rl.retryAfter });
            if (!(await verifyTurnstile(b.turnstileToken, ip))) return fail('Verifikasi keamanan gagal. Muat ulang & coba lagi.', 400);

            const email = sanitizeText(b.email, 120).toLowerCase();
            if (!EMAIL_RE.test(email)) return fail('Isi email yang valid untuk menerima lisensi & akunmu.');
            if (await emailIsRegistered(email)) {
                return fail('Email ini sudah terdaftar. Silakan login dulu agar pesanan masuk ke akunmu.', 409, { code: 'EMAIL_EXISTS' });
            }
            try {
                const u = await createAutoUser(email, sanitizeText(b.whatsapp, 20).replace(/[^\d+]/g, ''));
                createdUserId = u.id;
                owner = { id: u.id, email: u.email, token_version: u.token_version };
                isNew = true;
            } catch (e: any) {
                if (e?.message === 'EMAIL_EXISTS') return fail('Email ini sudah terdaftar. Silakan login dulu agar pesanan masuk ke akunmu.', 409, { code: 'EMAIL_EXISTS' });
                throw e;
            }
        }

        const r = await createQrisOrder(owner, {
            productSlug, itemSku,
            gameId: sanitizeText(b.gameId, 100),
            zoneId: sanitizeText(b.zoneId, 50),
            whatsapp: sanitizeText(b.whatsapp, 20).replace(/[^\d+]/g, ''),
        });
        if (!r.success) {
            if (createdUserId) await deleteAutoUser(createdUserId); // jangan tinggalkan akun yatim
            return fail(r.message, r.code === 'ERROR' ? 500 : 400, { code: r.code });
        }

        const res = NextResponse.json({ success: true, invoice_no: r.invoice_no, account_created: isNew }, { headers: { 'Cache-Control': 'no-store' } });
        if (isNew) attachUserSession(res, { id: owner.id, token_version: owner.token_version ?? 0 });
        return res;
    } catch (e: any) {
        console.error('[checkout]', e);
        if (createdUserId) await deleteAutoUser(createdUserId).catch(() => { });
        return fail('Terjadi kesalahan saat membuat pembayaran. Coba lagi.', 500);
    }
}
