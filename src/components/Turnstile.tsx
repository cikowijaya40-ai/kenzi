'use client';
import { useEffect, useRef } from 'react';

declare global { interface Window { turnstile?: any } }
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Widget Turnstile. Tidak tampil apa-apa bila NEXT_PUBLIC_TURNSTILE_SITE_KEY belum diisi. */
export default function Turnstile({ onToken, resetKey = 0 }: { onToken: (t: string) => void; resetKey?: number }) {
    const box = useRef<HTMLDivElement>(null);
    const id = useRef<any>(null);

    useEffect(() => {
        if (!SITE_KEY) return;
        let dead = false;
        const draw = () => {
            if (dead || !box.current || !window.turnstile || id.current !== null) return;
            id.current = window.turnstile.render(box.current, {
                sitekey: SITE_KEY, theme: 'dark',
                callback: (t: string) => onToken(t),
                'expired-callback': () => onToken(''),
                'error-callback': () => onToken(''),
            });
        };
        if (window.turnstile) draw();
        else {
            let s = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
            if (!s) { s = document.createElement('script'); s.src = SRC; s.async = true; document.head.appendChild(s); }
            s.addEventListener('load', draw);
        }
        return () => { dead = true; try { if (id.current !== null) window.turnstile?.remove(id.current); } catch { } id.current = null; };
    }, []); // eslint-disable-line

    useEffect(() => {
        if (resetKey && id.current !== null) { try { window.turnstile?.reset(id.current); } catch { } onToken(''); }
    }, [resetKey]); // eslint-disable-line

    if (!SITE_KEY) return null;
    return <div ref={box} style={{ marginTop: 16, minHeight: 65 }} />;
}

/** Mematikan klik kanan & pintasan inspect (kecuali di kolom input agar tempel/paste tetap bisa). Hanya pencegah awam. */
export function NoRightClick() {
    useEffect(() => {
        const inField = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('input, textarea, [contenteditable="true"]');
        const onCtx = (e: MouseEvent) => { if (!inField(e.target)) e.preventDefault(); };
        const onKey = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (e.ctrlKey && k === 'u')) e.preventDefault();
        };
        const onDrag = (e: DragEvent) => { if ((e.target as HTMLElement)?.tagName === 'IMG') e.preventDefault(); };
        document.addEventListener('contextmenu', onCtx);
        document.addEventListener('keydown', onKey);
        document.addEventListener('dragstart', onDrag);
        return () => { document.removeEventListener('contextmenu', onCtx); document.removeEventListener('keydown', onKey); document.removeEventListener('dragstart', onDrag); };
    }, []);
    return null;
}
