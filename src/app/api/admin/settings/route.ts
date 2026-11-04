import { NextResponse } from 'next/server';
import { getAdminSettingsView, updateSiteSettings } from '@/lib/settings';
import { verifyAdminAuth } from '@/lib/security';
import { sameOrigin } from '@/lib/security';

export const dynamic = 'force-dynamic';

const NS = { 'Cache-Control': 'no-store' };

export async function GET(req: Request) {
    if (!(await verifyAdminAuth(req))) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401, headers: NS });
    }
    try {
        return NextResponse.json({ success: true, data: await getAdminSettingsView() }, { headers: NS });
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500, headers: NS });
    }
}

export async function POST(req: Request) {
    if (!sameOrigin(req)) return NextResponse.json({ success: false, message: 'Origin tidak valid' }, { status: 403, headers: NS });
    if (!(await verifyAdminAuth(req))) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401, headers: NS });
    }
    try {
        const body = await req.json();
        await updateSiteSettings(body); // nilai rahasia bertopeng (••••) tidak menimpa nilai asli
        return NextResponse.json({ success: true, message: 'Pengaturan berhasil disimpan!', data: await getAdminSettingsView() }, { headers: NS });
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500, headers: NS });
    }
}
