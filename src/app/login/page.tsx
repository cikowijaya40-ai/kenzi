import type { Metadata } from 'next';
import SiteShell from '@/components/SiteShell';
import AuthForm from '@/components/AuthForm';

export const metadata: Metadata = { title: 'Login' };

export default function Page() {
    return <SiteShell plain><AuthForm mode="login" /></SiteShell>;
}
