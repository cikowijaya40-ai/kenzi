import './globals.css';
import './kx.css';
import type { Metadata, Viewport } from 'next';
import { NoRightClick } from '@/components/Turnstile';

// Pengaturan di-cache di memori (60 dtk) — layout tidak membuat halaman jadi mahal.
export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    viewportFit: 'cover',
    themeColor: '#38a7ff',
};

// Metadata STATIS (tanpa query database) agar halaman publik disajikan dari CDN Vercel, bukan dirender per kunjungan.
const SITE = process.env.NEXT_PUBLIC_SITE_NAME || 'KENZIxCheat';
const DESC = 'Key license, mod cheat & premium access. Otomatis, cepat, dan aman.';
export const metadata: Metadata = {
    title: { default: SITE, template: `%s — ${SITE}` },
    description: DESC,
    openGraph: { title: SITE, description: DESC, siteName: SITE, locale: 'id_ID', type: 'website' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="id">
            <head>
                <link rel="icon" href="/images/logo.svg" type="image/svg+xml" />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet" />
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
                {/* Cadangan: jika CDN utama ikon gagal dimuat (diblokir/offline), muat dari jsDelivr */}
                <script dangerouslySetInnerHTML={{ __html: "window.addEventListener('load',function(){setTimeout(function(){try{var t=document.createElement('i');t.className='fa-solid fa-bars';t.style.cssText='position:absolute;visibility:hidden';document.body.appendChild(t);var c=getComputedStyle(t,'::before').content;document.body.removeChild(t);if(!c||c==='none'||c==='normal'){var l=document.createElement('link');l.rel='stylesheet';l.href='https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.1/css/all.min.css';document.head.appendChild(l);}}catch(e){}},1200)});" }} />
            </head>
            <body><NoRightClick />{children}</body>
        </html>
    );
}
