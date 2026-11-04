import { NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/security';
import { getAutogopayConfig, testAutogopayConnection } from '@/lib/autogopay';
import { MASK } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * Test koneksi AutoGopay TANPA membuat invoice sungguhan.
 * Body (opsional): { apiKey, baseUrl } — kalau kosong dipakai nilai yang sudah tersimpan.
 */
export async function POST(req: Request) {
    const isAuth = await verifyAdminAuth(req);
    if (!isAuth) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const saved = await getAutogopayConfig();

        // Panel admin memuat form dengan nilai bertopeng (••••abcd). Kalau topeng itu
        // dikirim balik ke sini, gateway pasti menolak dengan 401 "API Key tidak valid"
        // padahal key tersimpan benar — jadi topeng dianggap sama dengan kosong.
        const rawKey = String(body.apiKey || '').trim();
        const apiKey = rawKey && !rawKey.startsWith(MASK) ? rawKey : saved.apiKey;
        const baseUrl = String(body.baseUrl || '').trim() || saved.baseUrl;

        if (!apiKey) {
            return NextResponse.json({
                success: false,
                message: 'API Key AutoGopay belum diisi. Tempel key (awalan iak_) dari dashboard autogopay.net lalu simpan pengaturan.',
            });
        }

        await testAutogopayConnection({ apiKey, baseUrl });

        return NextResponse.json({
            success: true,
            message: 'Koneksi berhasil! API Key diterima, AutoGopay siap digunakan.',
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message || 'Test koneksi gagal' });
    }
}
