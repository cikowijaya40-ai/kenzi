import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from './cache';
import { getUserFromRequest } from './security';
import { sameOrigin } from './security';
import type { AppUser } from './types';

export const json = (data: unknown, status = 200, headers: Record<string, string> = NO_STORE_HEADERS) =>
    NextResponse.json(data, { status, headers });

export const fail = (message: string, status = 400, extra: Record<string, unknown> = {}) =>
    json({ success: false, message, ...extra }, status);

/** Wajib login. Mengembalikan user atau response 401. */
export async function requireUser(req: Request): Promise<{ user: AppUser } | { res: NextResponse }> {
    const user = await getUserFromRequest(req);
    if (!user) return { res: fail('Silakan login terlebih dahulu.', 401) };
    return { user };
}

/** Tolak request tulis dari origin lain (CSRF). */
export function csrfBlock(req: Request): NextResponse | null {
    return sameOrigin(req) ? null : fail('Permintaan ditolak (origin tidak valid).', 403);
}

export async function readJson(req: Request, maxBytes = 20_000): Promise<Record<string, any>> {
    const text = await req.text();
    if (text.length > maxBytes) throw new Error('Payload terlalu besar.');
    try {
        const v = JSON.parse(text || '{}');
        return v && typeof v === 'object' ? v : {};
    } catch {
        throw new Error('Format JSON tidak valid.');
    }
}
