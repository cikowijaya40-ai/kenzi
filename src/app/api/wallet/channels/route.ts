import { NextResponse } from 'next/server';
import { listChannels } from '@/lib/wallet';
import { PUBLIC_CACHE_HEADERS } from '@/lib/cache';
import { TOPUP_MIN, TOPUP_MAX } from '@/lib/wallet';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const channels = await listChannels();
        return NextResponse.json(
            {
                success: true,
                min: TOPUP_MIN,
                max: TOPUP_MAX,
                channels: channels.map((c) => ({ code: c.code, name: c.name, group: c.group_name, image: c.image_url })),
            },
            { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' } }
        );
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
