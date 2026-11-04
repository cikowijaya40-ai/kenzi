import type { Metadata } from 'next';
import SiteShell from '@/components/SiteShell';
import CatalogView from '@/components/CatalogView';

export const metadata: Metadata = { title: 'Katalog Produk' };

export default function ProdukPage() {
    return <SiteShell><CatalogView /></SiteShell>;
}
