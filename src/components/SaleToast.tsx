'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, rp } from '@/lib/client';

/**
 * Popup "F***** baru saja beli ..." (social proof) — data dari pesanan yang BENAR-BENAR lunas, nama tersamar.
 *  - Auto replay: bila tidak ada pembelian baru, pembelian terakhir diputar ulang bergiliran (label waktunya jujur:
 *    "baru saja" hanya untuk pembelian < 2 menit, selebihnya "3 jam lalu").
 *  - Realtime: browser mengecek pembelian baru tiap beberapa detik; yang baru langsung tampil menyela jeda.
 *  - Hemat kuota: feed di-cache CDN 30 dtk, polling berhenti saat tab tersembunyi / pengunjung diam >5 menit.
 * Lama tampil, jeda, replay & interval diatur admin (Pengaturan → Notifikasi Pembelian).
 */
interface Sale { id: string; n: string; p: string; s: string; a: number; t: string }
interface Cfg { enabled: boolean; display_sec: number; gap_sec: number; replay: boolean; realtime: boolean; poll_sec: number }
interface Feed { config: Cfg; items: Sale[] }

const OFF_KEY = 'kx_sale_off';
const POLL_ACTIVE_MS = 5 * 60_000;   // polling hanya bila ada interaksi dalam 5 menit terakhir
const SHOW_ACTIVE_MS = 10 * 60_000;  // popup berhenti bila pengunjung diam 10 menit
const MAX_LIVE_QUEUE = 3;

// Level modul: bertahan selama navigasi antar halaman (tanpa reload)
const seenGlobal = new Set<string>();
let booted = false;
let feedCache: { t: number; r: Feed } | null = null;
let feedFlight: Promise<Feed | null> | null = null;

function fetchFeed(force: boolean): Promise<Feed | null> {
    if (!force && feedCache && Date.now() - feedCache.t < 25_000) return Promise.resolve(feedCache.r);
    if (!feedFlight) {
        feedFlight = api<any>('/api/activity')
            .then((r) => {
                if (r.success && r.config) { feedCache = { t: Date.now(), r: { config: r.config, items: r.items || [] } }; return feedCache.r; }
                return null;
            })
            .finally(() => { feedFlight = null; });
    }
    return feedFlight;
}

function ago(iso: string): string {
    const m = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
    if (m < 2) return 'baru saja';
    if (m < 60) return `${m} menit lalu`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h} jam lalu` : `${Math.floor(h / 24)} hari lalu`;
}

export default function SaleToast() {
    const [sale, setSale] = useState<Sale | null>(null);
    const [on, setOn] = useState(false);
    const stopRef = useRef<() => void>(() => { });

    useEffect(() => {
        try { if (sessionStorage.getItem(OFF_KEY) === '1') return; } catch { }

        let alive = true;
        let cfg: Cfg | null = null;
        let history: Sale[] = [];
        const live: Sale[] = [];
        let cursor = 0;
        let displaying = false;
        let bootT: any, showT: any, hideT: any, pollT: any;
        let lastActive = Date.now();
        let lastLoad = 0;

        const ingest = (feed: Feed) => {
            cfg = feed.config;
            history = feed.items;
            const fresh = feed.items.filter((i) => !seenGlobal.has(i.id));
            feed.items.forEach((i) => seenGlobal.add(i.id));
            // Pembelian yang belum pernah terlihat di sesi ini (bukan muat pertama) = pembelian baru → antrean "live"
            if (booted) fresh.slice(0, MAX_LIVE_QUEUE).reverse().forEach((i) => live.push(i));
            booted = true;
        };

        const next = () => {
            if (!alive || !cfg || !cfg.enabled) return;
            if (document.hidden) { displaying = false; return; } // dilanjutkan oleh onVisible
            if (Date.now() - lastActive > SHOW_ACTIVE_MS) { showT = setTimeout(next, 5000); return; }
            let item = live.shift();
            if (!item && cfg.replay && history.length) { item = history[cursor % history.length]; cursor++; }
            if (!item) { showT = setTimeout(next, cfg.gap_sec * 1000); return; }
            displaying = true;
            setSale(item);
            setOn(true);
            hideT = setTimeout(() => {
                setOn(false);
                displaying = false;
                showT = setTimeout(next, (cfg?.gap_sec || 10) * 1000);
            }, cfg.display_sec * 1000);
        };

        const load = async (force: boolean) => {
            lastLoad = Date.now();
            const feed = await fetchFeed(force);
            if (!alive || !feed) return;
            ingest(feed);
            if (!feed.config.enabled) { stop(); return; }
            // Realtime: ada pembelian baru dan popup sedang jeda → tampilkan sekarang juga
            if (live.length && !displaying) { clearTimeout(showT); next(); }
        };

        const poll = () => {
            if (!alive || !cfg?.realtime) return;
            pollT = setTimeout(async () => {
                if (!document.hidden && Date.now() - lastActive < POLL_ACTIVE_MS) await load(true);
                poll();
            }, cfg.poll_sec * 1000);
        };

        const bump = () => { lastActive = Date.now(); };
        const onVisible = () => {
            if (document.hidden || !alive) return;
            bump();
            if (cfg?.realtime && Date.now() - lastLoad > cfg.poll_sec * 1000) load(true);
            if (!displaying) { clearTimeout(showT); showT = setTimeout(next, 1500); }
        };
        const EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
        EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }));
        document.addEventListener('visibilitychange', onVisible);

        function stop() {
            alive = false;
            clearTimeout(bootT); clearTimeout(showT); clearTimeout(hideT); clearTimeout(pollT);
            EVENTS.forEach((e) => window.removeEventListener(e, bump));
            document.removeEventListener('visibilitychange', onVisible);
            setOn(false);
            setSale(null);
        }
        stopRef.current = stop;

        // Mulai setelah halaman selesai dimuat agar tidak berebut dengan konten utama
        bootT = setTimeout(async () => {
            await load(false);
            if (!alive || !cfg?.enabled) return;
            if (!displaying) { clearTimeout(showT); showT = setTimeout(next, 2500); }
            poll();
        }, 2500);

        return stop;
    }, []);

    function dismiss() {
        try { sessionStorage.setItem(OFF_KEY, '1'); } catch { }
        stopRef.current();
    }

    if (!sale) return null;
    const recent = Date.now() - Date.parse(sale.t) < 2 * 60_000;
    return (
        <div className={`kx-sale${on ? ' on' : ''}`} role="status" aria-live="polite">
            <Link href={`/produk/${sale.s}`} className="in" tabIndex={on ? 0 : -1}>
                <span className="av">{sale.n.charAt(0)}</span>
                <span className="tx">
                    <b>{sale.n} {recent ? 'baru saja beli' : 'telah membeli'}</b>
                    <small>{sale.p}</small>
                    {!recent && <em>{ago(sale.t)}</em>}
                </span>
                <span className="pr">{rp(sale.a)}</span>
            </Link>
            <button type="button" className="x" aria-label="Tutup notifikasi" tabIndex={on ? 0 : -1} onClick={dismiss}>×</button>
        </div>
    );
}
