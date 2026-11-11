import { NextResponse } from 'next/server';
import { getActivityPayload } from '@/lib/activity';

export const dynamic = 'force-dynamic';

/**
 * Feed notifikasi pembelian untuk popup di katalog (publik, tanpa data sensitif).
 * Di-cache CDN Vercel 30 dtk: berapa pun jumlah pengunjung, server & database hanya dihitung ±2x / menit.
 */
export async function GET() {
    try {
        const data = await getActivityPayload();
        return NextResponse.json({ success: true, ...data }, {
            headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=120' },
        });
    } catch {
        return NextResponse.json({ success: false }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }
}
