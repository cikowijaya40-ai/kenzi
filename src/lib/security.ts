import crypto from 'crypto';
import { promisify } from 'util';
import { getSupabaseAdmin, requireDb } from './supabase';
import { NextResponse } from 'next/server';
import { memo } from './cache';
import type { AppUser } from './types';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/* ───────── Password hashing (scrypt, tanpa dependency native) ───────── */
export async function hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(password, salt, 64, SCRYPT);
    return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    try {
        const [algo, n, r, p, saltB64, hashB64] = (stored || '').split('$');
        if (algo !== 'scrypt') return false;
        const salt = Buffer.from(saltB64, 'base64');
        const expected = Buffer.from(hashB64, 'base64');
        const got = await scrypt(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
        return got.length === expected.length && crypto.timingSafeEqual(got, expected);
    } catch {
        return false;
    }
}

/** Hash palsu untuk menyamakan waktu respons saat user tidak ditemukan (anti user-enumeration). */
export const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

export function validatePasswordStrength(pw: string): string | null {
    if (typeof pw !== 'string' || pw.length < 8) return 'Password minimal 8 karakter.';
    if (pw.length > 128) return 'Password terlalu panjang (maks 128 karakter).';
    if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password harus mengandung huruf dan angka.';
    if (/^(admin123|password|12345678|qwerty123|admin1234)$/i.test(pw)) return 'Password terlalu mudah ditebak.';
    return null;
}

/* ───────── Token bertanda tangan HMAC (tanpa library JWT) ───────── */
let warned = false;
function secret(): string {
    const s = process.env.AUTH_SECRET || '';
    if (s.length >= 32) return s;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('AUTH_SECRET belum diset / kurang dari 32 karakter. Set di Vercel → Settings → Environment Variables.');
    }
    if (!warned) {
        warned = true;
        console.warn('[security] AUTH_SECRET belum diset — memakai secret DEV sementara (jangan dipakai di production).');
    }
    return 'dev-only-secret-change-me-dev-only-secret-change-me';
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signToken(payload: Record<string, unknown>, ttlSec: number): string {
    const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }));
    const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
    return `${body}.${sig}`;
}

export function verifyToken<T = Record<string, any>>(token: string | null | undefined): (T & { exp: number }) | null {
    if (!token || typeof token !== 'string' || token.length > 2048) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (!data || typeof data.exp !== 'number' || data.exp < Math.floor(Date.now() / 1000)) return null;
        return data;
    } catch {
        return null;
    }
}

/* ───────── Enkripsi simetris (AES-256-GCM) untuk data sementara, mis. kredensial awal akun otomatis ───────── */
function aesKey(): Buffer {
    return crypto.createHash('sha256').update('enc-v1:' + secret()).digest();
}
export function encryptSecret(plain: string): string {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', aesKey(), iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}
export function decryptSecret(blob: string | null | undefined): string | null {
    try {
        const [v, iv, tag, data] = String(blob || '').split('.');
        if (v !== 'v1' || !iv || !tag || !data) return null;
        const d = crypto.createDecipheriv('aes-256-gcm', aesKey(), Buffer.from(iv, 'base64url'));
        d.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
    } catch {
        return null;
    }
}

/* ───────── Util ───────── */
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

export function getClientIp(req: Request): string {
    const xf = req.headers.get('x-forwarded-for');
    if (xf) return xf.split(',')[0].trim().slice(0, 64);
    return (req.headers.get('x-real-ip') || 'unknown').slice(0, 64);
}

export function readCookie(req: Request, name: string): string {
    const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch { return ''; }
}

/** Proteksi CSRF untuk request yang mengubah data: Origin harus sama dengan Host. */
export function sameOrigin(req: Request): boolean {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
    const origin = req.headers.get('origin');
    if (origin) {
        try { return new URL(origin).host === host; } catch { return false; }
    }
    const site = req.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') return false;
    return true;
}

/* ───────── Rate limit (atomik di DB; fallback memori bila DB error) ───────── */
const mem = new Map<string, { hits: number; reset: number }>();

export async function rateLimit(key: string, max: number, windowSec: number): Promise<{ allowed: boolean; retryAfter: number }> {
    try {
        const db = getSupabaseAdmin();
        if (db) {
            const { data, error } = await db.rpc('rate_limit_hit', { p_key: key.slice(0, 200), p_max: max, p_window: windowSec });
            const row = Array.isArray(data) ? data[0] : data;
            if (!error && row) return { allowed: !!row.allowed, retryAfter: Number(row.retry_after) || 0 };
        }
    } catch { /* jatuh ke memori */ }
    const now = Date.now();
    const cur = mem.get(key);
    if (!cur || cur.reset <= now) {
        mem.set(key, { hits: 1, reset: now + windowSec * 1000 });
        return { allowed: true, retryAfter: 0 };
    }
    cur.hits++;
    return { allowed: cur.hits <= max, retryAfter: Math.ceil((cur.reset - now) / 1000) };
}

/**
 * Verifikasi Cloudflare Turnstile di server.
 * Aktif hanya jika TURNSTILE_SECRET_KEY diisi. Jika kosong, pengecekan dilewati (agar situs tetap jalan saat setup).
 */
export const turnstileEnabled = () => Boolean(process.env.TURNSTILE_SECRET_KEY);

export async function verifyTurnstile(token: unknown, ip?: string): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) return true;
    if (typeof token !== 'string' || token.length < 10 || token.length > 4096) return false;
    try {
        const body = new URLSearchParams({ secret, response: token });
        if (ip && ip !== 'unknown') body.set('remoteip', ip);
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, cache: 'no-store' });
        const data = await res.json();
        return data?.success === true;
    } catch {
        return false;
    }
}

export const USER_COOKIE = 'epep_sid';
export const ADMIN_COOKIE = 'epep_asid';
const USER_TTL = 60 * 60 * 24 * 14; // 14 hari
const ADMIN_TTL = 60 * 60 * 12; // 12 jam

const cookieBase = {
    httpOnly: true, // tidak bisa dibaca JavaScript → aman dari pencurian via XSS
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
};

/* ───────── USER ───────── */
export function attachUserSession(res: NextResponse, user: { id: string; token_version: number }) {
    res.cookies.set(USER_COOKIE, signToken({ k: 'u', uid: user.id, v: user.token_version }, USER_TTL), { ...cookieBase, maxAge: USER_TTL });
    // Penanda "sudah login" (tanpa data rahasia) agar pengunjung anonim tidak perlu memanggil server
    res.cookies.set('epep_in', '1', { ...cookieBase, httpOnly: false, maxAge: USER_TTL });
}
export function clearUserSession(res: NextResponse) {
    res.cookies.set(USER_COOKIE, '', { ...cookieBase, maxAge: 0 });
    res.cookies.set('epep_in', '', { ...cookieBase, httpOnly: false, maxAge: 0 });
}

export async function getUserFromRequest(req: Request): Promise<AppUser | null> {
    const tok = verifyToken<{ k: string; uid: string; v: number }>(readCookie(req, USER_COOKIE));
    if (!tok || tok.k !== 'u') return null;
    const { data } = await requireDb()
        .from('users')
        .select('id, username, email, whatsapp, balance, is_banned, token_version, created_at')
        .eq('id', tok.uid)
        .maybeSingle();
    if (!data || data.is_banned || data.token_version !== tok.v) return null;
    const { token_version, ...pub } = data as any;
    return { ...pub, balance: Number(pub.balance) } as AppUser;
}

/* ───────── ADMIN ───────── */
export function attachAdminSession(res: NextResponse, admin: { id: string; token_version: number }): string {
    const token = signToken({ k: 'a', aid: admin.id, v: admin.token_version }, ADMIN_TTL);
    res.cookies.set(ADMIN_COOKIE, token, { ...cookieBase, maxAge: ADMIN_TTL });
    return token;
}
export function clearAdminSession(res: NextResponse) {
    res.cookies.set(ADMIN_COOKIE, '', { ...cookieBase, maxAge: 0 });
}

export interface AdminIdentity { id: string; username: string; email: string | null }

export async function getAdminFromRequest(req: Request): Promise<AdminIdentity | null> {
    // Token boleh datang dari cookie httpOnly (utama) atau header (kompatibel dengan panel lama)
    const auth = req.headers.get('authorization') || '';
    const raw =
        readCookie(req, ADMIN_COOKIE) ||
        (auth.startsWith('Bearer ') ? auth.slice(7).trim() : '') ||
        (req.headers.get('x-admin-token') || '').trim() ||
        (req.headers.get('x-admin-pin') || '').trim();
    const tok = verifyToken<{ k: string; aid: string; v: number }>(raw);
    if (!tok || tok.k !== 'a') return null;

    // Cek ke DB dengan cache 15 detik (panel admin memanggil banyak endpoint sekaligus)
    const row = await memo(`admin:${tok.aid}`, 15_000, async () => {
        const { data } = await requireDb().from('admin_users').select('id, username, email, token_version').eq('id', tok.aid).maybeSingle();
        return data as { id: string; username: string; email: string | null; token_version: number } | null;
    });
    if (!row || row.token_version !== tok.v) return null;
    return { id: row.id, username: row.username, email: row.email };
}

/** Dipakai semua endpoint /api/admin/*. True hanya jika token admin valid & belum dicabut. */
export async function verifyAdminAuth(req: Request): Promise<boolean> {
    try {
        return Boolean(await getAdminFromRequest(req));
    } catch {
        return false;
    }
}
