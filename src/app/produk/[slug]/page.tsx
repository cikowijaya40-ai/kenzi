import SiteShell from '@/components/SiteShell';
import ProductBuy from '@/components/ProductBuy';

// Halaman ini hanya "cangkang" (data produk diambil klien dari /api/catalog yang di-cache CDN).
// Tanpa ini, SETIAP kunjungan ke halaman produk = 1 invocation function Vercel.
// Dengan ini: dirender sekali per slug lalu disajikan dari cache CDN (diperbarui paling sering 1x/hari).
export const revalidate = 86400;
export function generateStaticParams() { return []; }

export default function ProdukDetail({ params }: { params: { slug: string } }) {
    return <SiteShell><ProductBuy slug={params.slug} /></SiteShell>;
}
