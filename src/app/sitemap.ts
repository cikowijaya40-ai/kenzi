import { MetadataRoute } from 'next';
import { getAllProducts } from '@/lib/products';

// Dibangun ulang paling sering 1x/hari (bukan beku di waktu build, bukan per kunjungan)
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const base = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const products = await getAllProducts().catch(() => []);
    return [
        { url: base, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
        { url: `${base}/produk`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
        ...products.map((p) => ({ url: `${base}/produk/${p.slug}`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.8 })),
    ];
}
