import type { Metadata } from 'next';
import SiteShell from '@/components/SiteShell';
import OrderView from '@/components/OrderView';

export const metadata: Metadata = { title: 'Detail Pesanan', robots: { index: false } };

export default function Page({ params }: { params: { invoice: string } }) {
    return <SiteShell plain><OrderView invoice={params.invoice} /></SiteShell>;
}
