/** @type {import('next').NextConfig} */
const securityHeaders = [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    // Gambar produk dipakai apa adanya (<img>) — tidak memakai Vercel Image Optimization agar kuota gratis aman.
    images: { unoptimized: true },
    async redirects() {
        return [
            { source: '/lacak', destination: '/dashboard', permanent: false },
            { source: '/topup', destination: '/dashboard#topup', permanent: false },
        ];
    },
    async headers() {
        return [
            { source: '/:path*', headers: securityHeaders },
            // Gambar statis: simpan 7 hari di browser/CDN (hemat Fast Data Transfer Vercel)
            { source: '/images/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }] },
        ];
    },
};

module.exports = nextConfig;
