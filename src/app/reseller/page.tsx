import type { Metadata } from 'next';
import SiteShell from '@/components/SiteShell';
import { ResellerLanding } from '@/components/Reseller';

export const metadata: Metadata = { title: 'Jadi Reseller' };

export default function Page() {
    return <SiteShell><ResellerLanding /></SiteShell>;
}
