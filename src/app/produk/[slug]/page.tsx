import SiteShell from '@/components/SiteShell';
import ProductBuy from '@/components/ProductBuy';

export default function ProdukDetail({ params }: { params: { slug: string } }) {
    return <SiteShell><ProductBuy slug={params.slug} /></SiteShell>;
}
