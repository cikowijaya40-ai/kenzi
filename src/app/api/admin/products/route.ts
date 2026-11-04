import { NextResponse } from 'next/server';
import { getAllProducts, createProduct, updateProduct, deleteProduct } from '@/lib/products';
import { verifyAdminAuth } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const isAuth = await verifyAdminAuth(req);
    if (!isAuth) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const prods = await getAllProducts(true);
        return NextResponse.json({ success: true, data: prods });
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const isAuth = await verifyAdminAuth(req);
    if (!isAuth) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { isEdit, slug, ...productData } = body;

        if (isEdit && slug) {
            const updated = await updateProduct(slug, productData);
            if (!updated) {
                return NextResponse.json({ success: false, message: 'Produk tidak ditemukan' }, { status: 404 });
            }
            return NextResponse.json({ success: true, message: 'Produk berhasil diupdate', data: updated });
        } else {
            const created = await createProduct(productData);
            return NextResponse.json({ success: true, message: 'Produk baru berhasil ditambahkan', data: created });
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
        const slug = searchParams.get('slug');

        if (!slug) {
            return NextResponse.json({ success: false, message: 'Slug diperlukan' }, { status: 400 });
        }

        const ok = await deleteProduct(slug);
        return NextResponse.json({ success: ok, message: ok ? 'Produk berhasil dihapus' : 'Produk tidak ditemukan' });
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
