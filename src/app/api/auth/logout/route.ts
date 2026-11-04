import { NextResponse } from 'next/server';
import { clearUserSession } from '@/lib/security';
import { csrfBlock } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    const res = NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
    clearUserSession(res);
    return res;
}
