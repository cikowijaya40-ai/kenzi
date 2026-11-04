import { NextResponse } from 'next/server';
import { bulkUpdatePricing, BulkPricingParams } from '@/lib/products';
import { verifyAdminAuth } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const isAuth = await verifyAdminAuth(req);
    if (!isAuth) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body: BulkPricingParams = await req.json();
        const result = await bulkUpdatePricing(body);
        return NextResponse.json(result);
    } catch (e: any) {
        console.error('Error in bulk-pricing API:', e);
        return NextResponse.json(
            { success: false, message: e.message || 'Gagal memproses pengaturan harga massal' },
            { status: 500 }
        );
    }
}
