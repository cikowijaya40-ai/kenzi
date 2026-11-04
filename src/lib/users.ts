import { requireDb } from './supabase';
import type { AppUser } from './types';
import { hashPassword, validatePasswordStrength } from './security';

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export function sanitizeText(s: unknown, max = 100): string {
    return String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
}

export async function findUserForLogin(identifier: string) {
    const id = sanitizeText(identifier, 255).toLowerCase();
    const db = requireDb();
    const col = id.includes('@') ? 'email' : 'username';
    const { data } = await db.from('users').select('*').ilike(col, id.replace(/[%_]/g, (m) => '\\' + m)).maybeSingle();
    return data as (AppUser & { password_hash: string; token_version: number }) | null;
}

export async function listUsers(search = '', limit = 100) {
    let q = requireDb()
        .from('users')
        .select('id, username, email, whatsapp, balance, is_banned, created_at, last_login_at')
        .order('created_at', { ascending: false })
        .limit(limit);
    const s = sanitizeText(search, 50).replace(/[%,()]/g, '');
    if (s) q = q.or(`username.ilike.%${s}%,email.ilike.%${s}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []).map((u: any) => ({ ...u, balance: Number(u.balance) }));
}

export interface AdminRow {
    id: string;
    username: string;
    password_hash: string;
    email: string | null;
    token_version: number;
}

export const ADMIN_USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

/**
 * Admin pertama dibuat otomatis dari env ADMIN_USERNAME + ADMIN_PASSWORD (hanya jika tabel admin_users masih kosong).
 * Setelah itu password hanya tersimpan sebagai hash; env tersebut boleh dihapus.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
    const db = requireDb();
    const { count } = await db.from('admin_users').select('id', { head: true, count: 'exact' });
    if ((count || 0) > 0) return;

    const username = (process.env.ADMIN_USERNAME || '').trim();
    const password = process.env.ADMIN_PASSWORD || '';
    if (!ADMIN_USERNAME_RE.test(username) || validatePasswordStrength(password)) {
        console.warn('[admin] ADMIN_USERNAME/ADMIN_PASSWORD belum diset atau terlalu lemah (min 8 karakter, huruf+angka).');
        return;
    }
    const { error } = await db.from('admin_users').insert({
        username,
        password_hash: await hashPassword(password),
        email: (process.env.ADMIN_EMAIL || '').trim() || null,
    });
    if (error && !/duplicate|unique/i.test(error.message)) console.error('[admin] gagal membuat admin awal:', error.message);
}

export async function findAdminByUsername(username: string): Promise<AdminRow | null> {
    const u = (username || '').trim().replace(/[%_\\]/g, (m) => '\\' + m);
    if (!u) return null;
    const { data } = await requireDb().from('admin_users').select('*').ilike('username', u).maybeSingle();
    return (data as AdminRow) || null;
}

export async function getFirstAdmin(): Promise<AdminRow | null> {
    const { data } = await requireDb().from('admin_users').select('*').order('created_at', { ascending: true }).limit(1).maybeSingle();
    return (data as AdminRow) || null;
}
