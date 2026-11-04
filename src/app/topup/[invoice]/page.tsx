import type { Metadata } from 'next';
import SiteShell from '@/components/SiteShell';
import TopupPay from '@/components/TopupPay';

export const metadata: Metadata = { title: 'Isi Saldo', robots: { index: false } };

export default function Page({ params }: { params: { invoice: string } }) {
    return <SiteShell plain><TopupPay invoice={params.invoice} /></SiteShell>;
}
