import { NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/security';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const BUCKET_NAME = 'store-assets';

export async function POST(req: Request) {
    const isAuth = await verifyAdminAuth(req);
    if (!isAuth) {
        return NextResponse.json({ success: false, message: 'Unauthorized (PIN salah)' }, { status: 401 });
    }

    try {
        const contentTypeHeader = req.headers.get('content-type') || '';
        let fileBuffer: Buffer | null = null;
        let mimeType = 'image/jpeg';
        let originalName = 'upload.jpg';
        let folder = 'assets';

        if (contentTypeHeader.includes('multipart/form-data')) {
            const formData = await req.formData();
            const file = formData.get('file') as File | null;
            const requestedFolder = formData.get('folder') as string | null;
            if (requestedFolder) folder = requestedFolder.replace(/[^a-zA-Z0-9_-]/g, '');

            if (!file) {
                return NextResponse.json({ success: false, message: 'File tidak ditemukan' }, { status: 400 });
            }

            const arrayBuf = await file.arrayBuffer();
            fileBuffer = Buffer.from(arrayBuf);
            mimeType = file.type || 'image/jpeg';
            originalName = file.name || 'upload.jpg';
        } else {
            const body = await req.json();
            if (!body.base64) {
                return NextResponse.json({ success: false, message: 'Data base64 tidak ditemukan' }, { status: 400 });
            }
            if (body.folder) folder = String(body.folder).replace(/[^a-zA-Z0-9_-]/g, '');
            if (body.fileName) originalName = String(body.fileName);
            if (body.mimeType) mimeType = String(body.mimeType);

            // Clean data URI prefix if present
            const cleanBase64 = body.base64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
            fileBuffer = Buffer.from(cleanBase64, 'base64');
        }

        if (!fileBuffer || fileBuffer.length === 0) {
            return NextResponse.json({ success: false, message: 'Ukuran file kosong' }, { status: 400 });
        }

        // Limit size to 10MB
        if (fileBuffer.length > 10 * 1024 * 1024) {
            return NextResponse.json({ success: false, message: 'Ukuran gambar maksimal 10MB' }, { status: 400 });
        }

        // Determine extension
        const extMatch = originalName.match(/\.([a-zA-Z0-9]+)$/);
        let ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
        if (ext === 'jpeg') ext = 'jpg';
        if (!['jpg', 'png', 'webp', 'gif', 'svg'].includes(ext)) {
            if (mimeType.includes('png')) ext = 'png';
            else if (mimeType.includes('webp')) ext = 'webp';
            else if (mimeType.includes('gif')) ext = 'gif';
            else if (mimeType.includes('svg')) ext = 'svg';
            else ext = 'jpg';
        }

        const safeBaseName = originalName
            .replace(/\.[^/.]+$/, '')
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '_')
            .slice(0, 30);
        const fileName = `${folder}/${Date.now()}_${safeBaseName || 'img'}.${ext}`;

        const client = getSupabaseAdmin();
        if (client) {
            try {
                // Nama file unik (timestamp) → aman di-cache 1 tahun di browser/CDN: hemat egress Storage Supabase
                const doUpload = () => client.storage.from(BUCKET_NAME).upload(fileName, fileBuffer!, {
                    contentType: mimeType,
                    upsert: true,
                    cacheControl: '31536000',
                });
                let { data: uploadData, error: uploadErr } = await doUpload();

                // Bucket dibuat HANYA bila belum ada (sebelumnya listBuckets() dipanggil di setiap upload)
                if (uploadErr && /bucket.*not found|not found.*bucket/i.test(String((uploadErr as any).message || ''))) {
                    await client.storage.createBucket(BUCKET_NAME, { public: true, fileSizeLimit: 10485760 });
                    ({ data: uploadData, error: uploadErr } = await doUpload());
                }

                if (!uploadErr && uploadData) {
                    const { data: pubData } = client.storage.from(BUCKET_NAME).getPublicUrl(fileName);
                    return NextResponse.json({
                        success: true,
                        url: pubData.publicUrl,
                        fileName,
                        size: fileBuffer.length,
                        storage: 'supabase',
                        message: 'Foto berhasil diunggah ke Supabase CDN!',
                    });
                } else if (uploadErr) {
                    console.warn('Supabase storage upload error:', uploadErr);
                }
            } catch (err: any) {
                console.warn('Supabase storage exception:', err);
            }
        }

        // Fallback Data URL hanya untuk gambar kecil. Data URL disimpan di database lalu ikut terkirim di SETIAP
        // respons katalog → gambar besar akan menguras bandwidth Vercel & egress Supabase.
        if (fileBuffer.length > 150 * 1024) {
            return NextResponse.json({
                success: false,
                message: 'Upload ke Supabase Storage gagal, dan gambar ini terlalu besar (>150KB) untuk disimpan langsung di database. Cek bucket "store-assets" (public) & SUPABASE_SERVICE_ROLE_KEY, atau kecilkan gambar / tempel URL gambar.',
            }, { status: 502 });
        }
        const fallbackDataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
        return NextResponse.json({
            success: true,
            url: fallbackDataUrl,
            fileName,
            size: fileBuffer.length,
            storage: 'data-url',
            message: 'Foto berhasil dimuat (Data URL)!',
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message || 'Gagal mengunggah foto' }, { status: 500 });
    }
}
