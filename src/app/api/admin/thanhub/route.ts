import { verifyAdminAuth, sameOrigin } from '@/lib/security';
import { getSiteSettings, updateSiteSettings } from '@/lib/settings';
import { getThanhubConfig, isSafeBaseUrl, normalizeBaseUrl, thTest } from '@/lib/thanhub';
import { fail, json } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const mask = (k: string) => (k ? '••••' + k.slice(-4) : '');

export async function GET(req: Request) {
    if (!(await verifyAdminAuth(req))) return fail('Unauthorized', 401);
    const c = await getThanhubConfig();
    return json({ success: true, baseUrl: c.baseUrl, hasKey: Boolean(c.apiKey), keyMask: mask(c.apiKey) });
}

export async function POST(req: Request) {
    if (!sameOrigin(req)) return fail('Origin tidak valid.', 403);
    if (!(await verifyAdminAuth(req))) return fail('Unauthorized', 401);
    try {
        const b = await req.json().catch(() => ({}));
        const action = String(b.action || '');
        const saved = await getThanhubConfig();

        if (action === 'save' || action === 'test') {
            const baseUrl = normalizeBaseUrl(b.baseUrl || saved.baseUrl);
            const typedKey = String(b.apiKey || '').trim();
            const apiKey = typedKey && !typedKey.startsWith('••••') ? typedKey : saved.apiKey;
            if (!baseUrl) return fail('Isi alamat Thanhub dulu.');
            if (!isSafeBaseUrl(baseUrl)) return fail('Alamat Thanhub tidak valid. Contoh yang benar: https://namathanhub.my.id');
            if (!apiKey) return fail('Isi API Key dulu (yang diawali thb_).');
            if (!/^thb_[A-Za-z0-9]{20,}$/.test(apiKey)) return fail('API Key harus diawali "thb_" dan tidak boleh ada spasi. Salin ulang dari portal Thanhub.');

            const test = await thTest({ baseUrl, apiKey });
            if (!test.success) return json({ success: false, message: test.message });

            if (action === 'save') {
                await updateSiteSettings({ thanhub_base_url: baseUrl, thanhub_api_key: apiKey } as any);
            }
            return json({ saved: action === 'save', ...test }); // test.success sudah true di titik ini
        }

        if (action === 'balance') {
            const t = await thTest({ baseUrl: saved.baseUrl, apiKey: saved.apiKey });
            return json(t.success ? { success: true, balance: t.balance, products: t.products, variants: t.variants } : { success: false, message: t.message });
        }

        return fail('Aksi tidak dikenal.');
    } catch (e: any) {
        return fail(e?.message || 'Terjadi kesalahan.', 500);
    }
}
