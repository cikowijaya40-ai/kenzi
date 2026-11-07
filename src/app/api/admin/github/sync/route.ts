import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/security';
import { isGitHubConfigured, syncStoreToGitHub } from '@/lib/github';
import { getAllProducts } from '@/lib/products';
import { getSiteSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
    const isAuth = await verifyAdminAuth(req);
    if (!isAuth) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // GitHub sync bersifat opsional: env belum diisi → balas jelas (bukan error 500) dan jangan baca database sama sekali
    if (!isGitHubConfigured()) {
        return NextResponse.json({
            success: false,
            code: 'NOT_CONFIGURED',
            error: 'GitHub sync belum dikonfigurasi (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPOS)',
        });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const message = body.message || 'Auto-update store data from Admin Dashboard';

        // Ambil data produk & settings terbaru
        const [products, settings] = await Promise.all([
            getAllProducts(),
            getSiteSettings(),
        ]);

        const backupData = {
            synced_at: new Date().toISOString(),
            settings: {
                site_name: settings?.site_name,
                whatsapp_cs: settings?.whatsapp_cs,
                updated_at: new Date().toISOString(),
            },
            total_products: products.length,
            products: products.map(p => ({
                id: p.id,
                name: p.name,
                slug: p.slug,
                category_slug: p.category_slug,
                items_count: p.items?.length || 0,
            })),
        };

        const result = await syncStoreToGitHub(message, backupData);
        if (!result.success) {
            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            commitUrl: result.commitUrl,
            commitSha: result.commitSha,
            message: 'Berhasil backup ke GitHub. Website tetap membaca Supabase, tidak perlu build ulang.',
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
