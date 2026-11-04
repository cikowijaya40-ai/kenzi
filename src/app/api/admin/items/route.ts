import { NextResponse } from 'next/server';
import { createProductItem, updateProductItem, deleteProductItem } from '@/lib/products';
import { verifyAdminAuth } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const isAuth = await verifyAdminAuth(req);
    if (!isAuth) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { isEdit, productSlug, itemId, ...itemData } = body;

        if (!productSlug) {
            return NextResponse.json({ success: false, message: 'productSlug diperlukan' }, { status: 400 });
        }

        if (isEdit && itemId) {
            const updated = await updateProductItem(productSlug, itemId, itemData);
            if (!updated) {
                return NextResponse.json({ success: false, message: 'Item SKU tidak ditemukan' }, { status: 404 });
            }
            return NextResponse.json({ success: true, message: 'Item SKU berhasil diupdate', data: updated });
        } else {
            const created = await createProductItem(productSlug, itemData);
            if (!created) {
                return NextResponse.json({ success: false, message: 'Gagal menambahkan item SKU' }, { status: 400 });
            }
            return NextResponse.json({ success: true, message: 'Item SKU baru berhasil ditambahkan', data: created });
        }
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const isAuth = await verifyAdminAuth(req);
    if (!isAuth) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const productSlug = searchParams.get('productSlug');
        const itemId = searchParams.get('itemId');

        if (!productSlug || !itemId) {
            return NextResponse.json({ success: false, message: 'productSlug dan itemId diperlukan' }, { status: 400 });
        }

        const ok = await deleteProductItem(productSlug, itemId);
        return NextResponse.json({ success: ok, message: ok ? 'Item SKU berhasil dihapus' : 'Gagal menghapus item' });
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
