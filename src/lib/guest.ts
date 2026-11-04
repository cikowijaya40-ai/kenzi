import crypto from 'crypto';
import { requireDb } from './supabase';
import { encryptSecret, decryptSecret, hashPassword } from './security';

/** Alfabet tanpa karakter membingungkan (0/O, 1/l/I) agar mudah diketik ulang. */
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const DIGIT = '23456789';

const pick = (set: string) => set[crypto.randomInt(set.length)];

export function generateUsername(): string {
    let s = 'user';
    for (let i = 0; i < 6; i++) s += pick(LOWER + DIGIT);
    return s; // 10 karakter, lolos USERNAME_RE
}

/** 10 karakter, dijamin ada huruf besar, huruf kecil, dan angka → lolos validatePasswordStrength. */
export function generatePassword(): string {
    const chars = [pick(UPPER), pick(LOWER), pick(DIGIT)];
    const all = LOWER + UPPER + DIGIT;
    while (chars.length < 10) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i--) { // Fisher–Yates dengan RNG kriptografis
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

export async function emailIsRegistered(email: string): Promise<boolean> {
    const e = email.trim().toLowerCase().replace(/[%_\\]/g, (m) => '\\' + m);
    const { data } = await requireDb().from('users').select('id').ilike('email', e).limit(1);
    return !!(data && data.length);
}

export interface AutoUser { id: string; username: string; email: string; token_version: number; password: string }

/**
 * Buat akun otomatis untuk pembeli pertama. Kredensial awal disimpan TERENKRIPSI (AES-256-GCM)
 * di users.init_cred supaya bisa ditampilkan lagi di halaman pesanan; dihapus begitu user ganti password/username.
 */
export async function createAutoUser(email: string, whatsapp: string): Promise<AutoUser> {
    const db = requireDb();
    const password = generatePassword();
    const password_hash = await hashPassword(password);
    let lastErr = '';
    for (let i = 0; i < 6; i++) {
        const username = generateUsername();
        const { data, error } = await db
            .from('users')
            .insert({
                username, email, password_hash, whatsapp: whatsapp || null,
                auto_created: true,
                init_cred: encryptSecret(JSON.stringify({ u: username, p: password })),
                last_login_at: new Date().toISOString(),
            })
            .select('id, username, email, token_version')
            .single();
        if (!error && data) return { ...(data as any), password };
        lastErr = error?.message || '';
        if (/users_email_lower_uq|email/i.test(lastErr) && /duplicate|unique/i.test(lastErr)) throw new Error('EMAIL_EXISTS');
        if (!/duplicate|unique/i.test(lastErr)) break; // bukan tabrakan username → jangan diulang
    }
    throw new Error(lastErr || 'Gagal membuat akun otomatis.');
}

export function readInitCred(blob: string | null | undefined): { username: string; password: string } | null {
    const raw = decryptSecret(blob);
    if (!raw) return null;
    try {
        const j = JSON.parse(raw);
        return j?.u && j?.p ? { username: String(j.u), password: String(j.p) } : null;
    } catch {
        return null;
    }
}

export async function deleteAutoUser(id: string) {
    await requireDb().from('users').delete().eq('id', id).eq('auto_created', true);
}
