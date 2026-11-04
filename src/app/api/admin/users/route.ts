import { requireDb } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/security';
import { listUsers } from '@/lib/users';
import { adminAdjust, listLedger } from '@/lib/wallet';
import { fail, json, csrfBlock, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: Request) {
    const admin = await getAdminFromRequest(req).catch(() => null);
    if (!admin) return fail('Unauthorized', 401);
    try {
        const sp = new URL(req.url).searchParams;
        const view = sp.get('view');
        if (view === 'ledger') {
            const uid = sp.get('userId') || '';
            if (!UUID.test(uid)) return fail('userId tidak valid.');
            return json({ success: true, ledger: await listLedger(uid, 50) });
        }
        if (view === 'topups') {
            const { data } = await requireDb()
                .from('topups')
                .select('invoice_no, amount, total_amount, payment_name, status, created_at, paid_at, users(username)')
                .order('created_at', { ascending: false })
                .limit(50);
            return json({ success: true, topups: data || [] });
        }
        const users = await listUsers(sp.get('q') || '', 100);
        const total = users.reduce((n: number, u: any) => n + u.balance, 0);
        return json({ success: true, users, totalBalance: total });
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
        const uid = String(b.userId || '');
        if (!UUID.test(uid)) return fail('userId tidak valid.');
        const db = requireDb();

        if (b.action === 'adjust') {
            const delta = Math.trunc(Number(b.delta));
            if (!delta || Math.abs(delta) > 100_000_000) return fail('Nominal tidak valid.');
            const note = String(b.note || '').slice(0, 120) || (delta > 0 ? 'Tambah saldo manual' : 'Kurangi saldo manual');
            const balance = await adminAdjust(uid, delta, note, admin.username);
            return json({ success: true, balance });
        }
        if (b.action === 'ban') {
            const banned = Boolean(b.banned);
            const { data: u } = await db.from('users').select('token_version').eq('id', uid).single();
            await db.from('users').update({ is_banned: banned, token_version: (u?.token_version || 0) + 1 }).eq('id', uid);
            return json({ success: true });
        }
        return fail('Aksi tidak dikenal.');
    } catch (e: any) {
        return fail(e.message || 'Gagal.', 400);
    }
}
