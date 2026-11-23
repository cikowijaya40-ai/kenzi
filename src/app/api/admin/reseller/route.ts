import { getAdminFromRequest } from '@/lib/security';
import { updateSiteSettings } from '@/lib/settings';
import {
    adminCreateKeyFor, adminCreateReseller, adminDeleteReseller, adminDemote, adminItemRows, adminListResellers, adminProductList, adminPromote, cleanScope,
    adminResetPassword, adminSetBanned, adminSetItemResellerPrice, adminSetResellerDisabled, adminUpdateReseller,
    getResellerConfig, revokeApiKey,
} from '@/lib/reseller';
import { adminAdjust, listLedger } from '@/lib/wallet';
import { bust } from '@/lib/cache';
import { csrfBlock, fail, json, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Admin: kelola reseller (CRUD lengkap) + pengaturan + harga reseller per opsi.
 * GET  ?q=cari          → daftar reseller, pengaturan, harga per opsi
 * GET  ?view=ledger&userId=… → mutasi saldo satu reseller
 * POST { action, ... }  → create | promote | update | reset_password | adjust | create_key | revoke_key | disable | enable |
 *                         ban | demote | delete | settings | item_price
 */
export async function GET(req: Request) {
    const admin = await getAdminFromRequest(req).catch(() => null);
    if (!admin) return fail('Unauthorized', 401);
    try {
        const sp = new URL(req.url).searchParams;
        if (sp.get('view') === 'ledger') {
            const uid = sp.get('userId') || '';
            if (!UUID.test(uid)) return fail('userId tidak valid.');
            return json({ success: true, ledger: await listLedger(uid, 50) });
        }
        bust('rsl:cfg');
        const cfg = await getResellerConfig();
        const [resellers, items, products] = await Promise.all([adminListResellers(sp.get('q') || ''), adminItemRows(cfg), adminProductList()]);
        return json({ success: true, config: cfg, resellers, items: items.included, excluded: items.excluded, products });
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
        const uid = String(b.userId || '');
        const needUser = () => { if (!UUID.test(uid)) throw new Error('userId tidak valid.'); };

        if (action === 'settings') {
            const price = Math.trunc(Number(b.price));
            const discount = Number(b.discount);
            if (!Number.isFinite(price) || price < 0 || price > 100_000_000) return fail('Biaya join tidak valid (0 – 100.000.000).');
            if (!Number.isFinite(discount) || discount < 0 || discount > 90) return fail('Diskon harus 0 – 90 persen.');
            // scope/slugs opsional: kalau tidak dikirim, cakupan lama tidak diubah
            const sc = b.scope === undefined ? null : await cleanScope(b.scope, b.slugs);
            await updateSiteSettings({
                reseller_enabled: Boolean(b.enabled), reseller_price: price, reseller_discount: Math.round(discount * 100) / 100,
                reseller_api_enabled: Boolean(b.apiEnabled),
                ...(sc ? { reseller_scope: sc.scope, reseller_slugs: sc.slugs } : {}),
            } as any);
            bust('rsl:');
            return json({ success: true });
        }
        if (action === 'item_price') {
            const raw = b.price === '' || b.price === null || b.price === undefined ? null : Math.trunc(Number(b.price));
            if (raw !== null && !Number.isFinite(raw)) return fail('Harga tidak valid.');
            const ok = await adminSetItemResellerPrice(String(b.itemId || ''), raw);
            return ok ? json({ success: true }) : fail('Opsi tidak ditemukan.', 404);
        }

        // ---- CRUD akun reseller ----
        if (action === 'create') return json({ success: true, created: await adminCreateReseller(admin.username, b) });
        if (action === 'promote') return json({ success: true, user: await adminPromote(b) });

        needUser();
        if (action === 'update') return json({ success: true, user: await adminUpdateReseller(uid, b) });
        if (action === 'reset_password') return json({ success: true, ...(await adminResetPassword(uid, b.password ? String(b.password) : undefined)) });
        if (action === 'adjust') {
            const delta = Math.trunc(Number(b.delta));
            if (!delta || Math.abs(delta) > 100_000_000) return fail('Nominal tidak valid.');
            const note = String(b.note || '').slice(0, 120) || (delta > 0 ? 'Tambah saldo manual' : 'Kurangi saldo manual');
            return json({ success: true, balance: await adminAdjust(uid, delta, note, admin.username) });
        }
        if (action === 'create_key') return json({ success: true, ...(await adminCreateKeyFor(uid)) });
        if (action === 'revoke_key') return (await revokeApiKey(uid)) ? json({ success: true }) : fail('Gagal mencabut key.', 500);
        if (action === 'disable' || action === 'enable') {
            return (await adminSetResellerDisabled(uid, action === 'disable')) ? json({ success: true }) : fail('Reseller tidak ditemukan.', 404);
        }
        if (action === 'ban') { await adminSetBanned(uid, Boolean(b.banned)); return json({ success: true }); }
        if (action === 'demote') { await adminDemote(uid); return json({ success: true }); }
        if (action === 'delete') return json({ success: true, ...(await adminDeleteReseller(uid, String(b.confirm || ''))) });

        return fail('Aksi tidak dikenal.');
    } catch (e: any) {
        return fail(e?.message || 'Gagal.', 400);
    }
}
