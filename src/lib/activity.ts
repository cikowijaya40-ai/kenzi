import crypto from 'crypto';
import { getSupabaseAdmin } from './supabase';
import { getSiteSettings } from './settings';
import { memo } from './cache';

/**
 * Notifikasi pembelian (social proof). Data HANYA dari pesanan yang benar-benar lunas.
 * Yang keluar ke publik: inisial tersamar, nama produk, harga, waktu. Tidak ada invoice / email / WhatsApp.
 */
export interface ActivityConfig {
    enabled: boolean;
    display_sec: number;   // lama tiap notifikasi tampil
    gap_sec: number;       // jeda antar notifikasi
    replay: boolean;       // putar ulang pembelian terakhir bila tidak ada yang baru
    realtime: boolean;     // browser mengecek pembelian baru secara berkala
    poll_sec: number;      // interval pengecekan (detik)
}
export interface ActivityItem {
    id: string;  // hash pendek (bukan nomor invoice)
    n: string;   // nama tersamar, mis. "F*****"
    p: string;   // nama produk
    s: string;   // slug produk
    a: number;   // harga item
    t: string;   // waktu pembelian (ISO)
}

const clampInt = (v: unknown, min: number, max: number, def: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export function maskName(username?: string | null, email?: string | null): string {
    const base = String(username || (email || '').split('@')[0] || '').trim();
    const ch = base.charAt(0).toUpperCase();
    // huruf (punya versi besar/kecil berbeda) atau angka → pakai sebagai inisial; selain itu "P" (Pembeli)
    const ok = ch && (ch.toLowerCase() !== ch.toUpperCase() || /[0-9]/.test(ch));
    return (ok ? ch : 'P') + '*****';
}

async function recentSales(limit: number, maxAgeHours: number): Promise<ActivityItem[]> {
    return memo(`activity:${limit}:${maxAgeHours}`, 25_000, async () => {
        const db = getSupabaseAdmin();
        if (!db) return [];
        // Pesanan yang baru dibayar hampir pasti dibuat dalam rentang ini → memakai index (status, created_at)
        const since = new Date(Date.now() - (maxAgeHours + 2) * 3600_000).toISOString();
        const base = 'invoice_no, product_slug, product_name, amount, created_at, updated_at, customer_email';
        const q = (cols: string) => db.from('orders').select(cols).in('status', ['PAID', 'DELIVERED']).gte('created_at', since).order('created_at', { ascending: false }).limit(60);

        let { data, error } = await q(`${base}, users(username)`);
        if (error) ({ data, error } = await q(base)); // fallback tanpa relasi users
        if (error || !Array.isArray(data)) return [];

        const cutoff = Date.now() - maxAgeHours * 3600_000;
        return (data as any[])
            .map((o) => {
                const when = Date.parse(o.updated_at || o.created_at) || Date.parse(o.created_at) || 0;
                const u = Array.isArray(o.users) ? o.users[0] : o.users;
                return {
                    when,
                    item: {
                        id: crypto.createHash('sha256').update(String(o.invoice_no)).digest('hex').slice(0, 12),
                        n: maskName(u?.username, o.customer_email),
                        p: String(o.product_name || ''),
                        s: String(o.product_slug || ''),
                        a: Number(o.amount) || 0,
                        t: new Date(when).toISOString(),
                    } as ActivityItem,
                };
            })
            .filter((x) => x.when >= cutoff && x.item.p)
            .sort((a, b) => b.when - a.when)
            .slice(0, limit)
            .map((x) => x.item);
    });
}

export async function getActivityPayload(): Promise<{ config: ActivityConfig; items: ActivityItem[] }> {
    const s: any = await getSiteSettings();
    const config: ActivityConfig = {
        enabled: s.activity_enabled !== false,
        display_sec: clampInt(s.activity_display_sec, 3, 30, 6),
        gap_sec: clampInt(s.activity_gap_sec, 3, 300, 10),
        replay: s.activity_replay !== false,
        realtime: s.activity_realtime !== false,
        poll_sec: clampInt(s.activity_poll_sec, 30, 300, 30),
    };
    // Dimatikan admin → tidak ada query database sama sekali
    if (!config.enabled) return { config, items: [] };
    const items = await recentSales(clampInt(s.activity_max_items, 1, 30, 10), clampInt(s.activity_max_age_hours, 1, 720, 72));
    return { config, items };
}
