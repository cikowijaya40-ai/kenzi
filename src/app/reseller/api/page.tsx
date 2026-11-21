import type { Metadata } from 'next';
import SiteShell from '@/components/SiteShell';
import { ResellerApiDash } from '@/components/Reseller';

export const metadata: Metadata = { title: 'Reseller API', robots: { index: false } };

export default function Page() {
    return <SiteShell><ResellerApiDash /></SiteShell>;
}
