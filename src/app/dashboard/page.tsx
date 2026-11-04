import type { Metadata } from 'next';
import SiteShell from '@/components/SiteShell';
import Dashboard from '@/components/Dashboard';

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } };

export default function Page() {
    return <SiteShell><Dashboard /></SiteShell>;
}
