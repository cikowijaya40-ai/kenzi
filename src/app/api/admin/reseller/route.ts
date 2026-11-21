import { getAdminFromRequest } from '@/lib/security';
import { getSiteSettings, updateSiteSettings } from '@/lib/settings';
import { adminItemRows, adminListResellers, adminSetItemResellerPrice, adminSetResellerDisabled, getResellerConfig, revokeApiKey } from '@/lib/reseller';
import { bust } from '@/lib/cache';
import { csrfBlock, fail, json, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: Request) {
    const admin = await getAdminFromRequest(req).catch(() => null);
    if (!admin) return fail('Unauthorized', 401);
    try {
        bust('rsl:cfg');
        const cfg = await getResellerConfig();
        const [resellers, items] = await Promise.all([adminListResellers(), adminItemRows(cfg.discount)]);
        return json({ success: true, config: cfg, resellers, items: items.included, excluded: items.excluded });
    } catch (e: any) {
        return fail(e.message, 500);
    }
}

export async function POST(req: Request) {
    const blocked = csrfBlock(req);
    if (blocked) return blocked;
    const admin = await getAdminFromRequest(req).catch(() => null);
    if (!admin) return fail('Unauthorized', 401);
    try {
        const b = await readJson(req);
        const action = String(b.action || '');

        if (action === 'settings') {
            const cur = await getSiteSettings();
            const price = Math.trunc(Number(b.price));
            const discount = Number(b.discount);
            if (!Number.isFinite(price) || price < 0 || price > 100_000_000) return fail('Biaya join tidak valid (0 – 100.000.000).');
            if (!Number.isFinite(discount) || discount < 0 || discount > 90) return fail('Diskon harus 0 – 90 persen.');
            await updateSiteSettings({
                reseller_enabled: Boolean(b.enabled), reseller_price: price, reseller_discount: Math.round(discount * 100) / 100,
                reseller_api_enabled: Boolean(b.apiEnabled),
            } as any);
            void cur;
            bust('rsl:');
            return json({ success: true });
        }
        if (action === 'disable' || action === 'enable') {
            if (!UUID.test(String(b.userId || ''))) return fail('userId tidak valid.');
            const ok = await adminSetResellerDisabled(b.userId, action === 'disable');
            return ok ? json({ success: true }) : fail('Reseller tidak ditemukan.', 404);
        }
        if (action === 'revoke_key') {
            if (!UUID.test(String(b.userId || ''))) return fail('userId tidak valid.');
            return (await revokeApiKey(b.userId)) ? json({ success: true }) : fail('Gagal mencabut key.', 500);
        }
        if (action === 'item_price') {
            const raw = b.price === '' || b.price === null || b.price === undefined ? null : Math.trunc(Number(b.price));
            if (raw !== null && !Number.isFinite(raw)) return fail('Harga tidak valid.');
            const ok = await adminSetItemResellerPrice(String(b.itemId || ''), raw);
            return ok ? json({ success: true }) : fail('Opsi tidak ditemukan.', 404);
        }
        return fail('Aksi tidak dikenal.');
    } catch (e: any) {
        return fail(e?.message || 'Gagal.', 400);
    }
}
