import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    const base = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
    return {
        rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/dashboard', '/order/', '/topup/'] },
        ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
    };
}
