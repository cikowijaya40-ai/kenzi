import { NextResponse } from 'next/server';
import { requireDb } from '@/lib/supabase';
import { safeEqual } from '@/lib/security';
import { getThanhubConfig, thanhubReady, thCronTick } from '@/lib/thanhub';

export const dynamic = 'force-dynamic';

/**
 * Cron harian Vercel (lihat vercel.json). Fungsinya:
 *  1. Menjaga project Supabase gratisan tidak "paused" karena tidak aktif.
 *  2. Menandai top up PENDING > 2 jam sebagai EXPIRED & membersihkan tabel rate limit lama.
 */
export async function GET(req: Request) {
    const secret = process.env.CRON_SECRET || '';
    const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!secret || !safeEqual(given, secret)) {
        return NextResponse.json({ success: false }, { status: 401 });
    }
    const { data, error } = await requireDb().rpc('run_maintenance');
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    // Cek saldo Thanhub sekali sehari (email peringatan bila tipis)
    let thanhub: any = null;
    try { if (thanhubReady(await getThanhubConfig())) thanhub = await thCronTick(); } catch { thanhub = { success: false }; }
    return NextResponse.json({ success: true, result: data, thanhub });
}
