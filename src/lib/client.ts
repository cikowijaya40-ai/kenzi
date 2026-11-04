'use client';
import { useCallback, useEffect, useState } from 'react';

export const rp = (n: number | string) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T & { success?: boolean; message?: string; status?: number }> {
    const { json, ...rest } = init || {};
    try {
        const res = await fetch(path, {
            credentials: 'same-origin',
            ...rest,
            headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(rest.headers || {}) },
            body: json !== undefined ? JSON.stringify(json) : rest.body,
        });
        const data = await res.json().catch(() => ({}));
        return { ...data, status: res.status, success: data.success ?? res.ok };
    } catch {
        return { success: false, message: 'Koneksi bermasalah. Coba lagi.', status: 0 } as any;
    }
}

/* ───────── User / saldo (cache 20 dtk di sessionStorage agar tidak spam server) ───────── */
export interface MeUser { id: string; username: string; email: string; balance: number }
const ME_KEY = 'epep_me';
const ME_EVENT = 'epep:me';
let meFlight: Promise<any> | null = null;

export function refreshMe() {
    try { sessionStorage.removeItem(ME_KEY); } catch { }
    window.dispatchEvent(new Event(ME_EVENT));
}
export function setMeBalance(balance: number) {
    try {
        const raw = sessionStorage.getItem(ME_KEY);
        if (raw) {
            const c = JSON.parse(raw);
            if (c.user) { c.user.balance = balance; sessionStorage.setItem(ME_KEY, JSON.stringify(c)); }
        }
    } catch { }
    window.dispatchEvent(new Event(ME_EVENT));
}

export function useMe() {
    const [user, setUser] = useState<MeUser | null | undefined>(undefined); // undefined = memuat
    const load = useCallback(async () => {
        // Anonim (tidak ada penanda login) → tidak perlu memanggil server sama sekali
        if (!document.cookie.split('; ').some((c) => c === 'epep_in=1')) { setUser(null); return; }
        try {
            const raw = sessionStorage.getItem(ME_KEY);
            if (raw) {
                const c = JSON.parse(raw);
                if (Date.now() - c.t < 20_000) { setUser(c.user); return; }
            }
        } catch { }
        if (!meFlight) {
            meFlight = api<{ user: MeUser | null }>('/api/auth/me').finally(() => { meFlight = null; });
        }
        const r = await meFlight;
        const u = r.user || null;
        try { sessionStorage.setItem(ME_KEY, JSON.stringify({ t: Date.now(), user: u })); } catch { }
        setUser(u);
    }, []);
    useEffect(() => {
        load();
        window.addEventListener(ME_EVENT, load);
        return () => window.removeEventListener(ME_EVENT, load);
    }, [load]);
    return { user, reload: load };
}

/* ───────── Katalog (stale-while-revalidate di localStorage) ───────── */
export interface CatItem { sku: string; name: string; price: number; original_price: number; badge: string; in_stock: boolean; stock?: number }
export interface CatProduct {
    slug: string; name: string; category_slug: string; icon_url: string; banner_url: string; description: string; badge: string; publisher: string;
    input_label_1: string; input_placeholder_1: string; is_featured: boolean; items: CatItem[];
}
export interface PubSettings {
    site_name: string; site_logo: string; announcement: string; announcement_active: boolean; whatsapp_cs: string;
    banners: { id: string; title: string; subtitle: string; slug: string; image: string }[];
    telegram_cs?: string; wa_channel?: string; footer_text?: string; hero_desc?: string; store_subtitle?: string;
}
const CAT_KEY = 'epep_catalog_v2';

// Satu permintaan katalog dipakai bersama oleh semua komponen & halaman (maks 1x / 30 dtk per tab)
let catFlight: Promise<any> | null = null;
let catLast: { t: number; r: any } | null = null;
function fetchCatalog(): Promise<any> {
    if (catLast && Date.now() - catLast.t < 30_000) return Promise.resolve(catLast.r);
    if (!catFlight) {
        catFlight = api('/api/catalog').then((r) => { if (r.success) catLast = { t: Date.now(), r }; return r; }).finally(() => { catFlight = null; });
    }
    return catFlight;
}

export function useCatalog() {
    const [data, setData] = useState<{ products: CatProduct[]; settings: PubSettings } | null>(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let alive = true;
        try {
            const raw = localStorage.getItem(CAT_KEY);
            if (raw) { const c = JSON.parse(raw); if (c?.d) { setData(c.d); setLoading(false); } }
        } catch { }
        (async () => {
            const r: any = await fetchCatalog();
            if (!alive) return;
            if (r.success && r.products) {
                const d = { products: r.products, settings: r.settings };
                setData(d);
                try { localStorage.setItem(CAT_KEY, JSON.stringify({ t: Date.now(), d })); } catch { }
            }
            setLoading(false);
        })();
        return () => { alive = false; };
    }, []);
    return { data, loading };
}

export const fixImg = (u?: string) => (!u ? '' : u.startsWith('http') || u.startsWith('/') || u.startsWith('data:') ? u : '/' + u);

export function useToast() {
    const [msg, setMsg] = useState<{ t: 'ok' | 'bad'; text: string } | null>(null);
    const show = useCallback((text: string, t: 'ok' | 'bad' = 'ok') => {
        setMsg({ t, text });
        setTimeout(() => setMsg(null), 3500);
    }, []);
    return { msg, show };
}
