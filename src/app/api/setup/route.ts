import { NextResponse } from 'next/server';
import { testSupabaseConnection, getSupabaseCredentials } from '@/lib/supabase';
import { verifyAdminAuth } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const isAuth = await verifyAdminAuth(req);
    if (!isAuth) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const creds = getSupabaseCredentials();
    const result = await testSupabaseConnection();
    return NextResponse.json({
        configured: creds.isConfigured,
        connected: result.connected,
        message: result.connected ? 'Database terhubung normal' : 'Database belum terhubung',
    });
}
