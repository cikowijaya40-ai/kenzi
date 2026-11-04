/**
 * Cache in-memory sederhana (per instance serverless) + single-flight.
 * Tujuan: menghemat query Supabase & CPU Vercel gratisan.
 * - memo(): hasil dipakai ulang selama TTL; request bersamaan digabung jadi 1 query.
 * - bust(): hapus cache saat admin mengubah data.
 * Catatan: tiap instance Vercel punya cache sendiri, jadi kadaluarsa paling lama = TTL.
 */
type Entry = { v: unknown; exp: number };
const g = globalThis as unknown as { __epepCache?: Map<string, Entry>; __epepFlight?: Map<string, Promise<unknown>> };
const store = (g.__epepCache ||= new Map<string, Entry>());
const flight = (g.__epepFlight ||= new Map<string, Promise<unknown>>());

export async function memo<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const hit = store.get(key);
    const now = Date.now();
    if (hit && hit.exp > now) return hit.v as T;

    const running = flight.get(key);
    if (running) return running as Promise<T>;

    const p = (async () => {
        try {
            const v = await loader();
            store.set(key, { v, exp: Date.now() + ttlMs });
            return v;
        } catch (e) {
            // Bila DB sedang error, pakai data lama (stale) daripada halaman rusak
            if (hit) return hit.v as T;
            throw e;
        } finally {
            flight.delete(key);
        }
    })();
    flight.set(key, p);
    return p;
}

export function bust(prefix: string) {
    store.forEach((_v, k) => {
        if (k.startsWith(prefix)) store.delete(k);
    });
}

/** Header Cache-Control untuk endpoint publik: di-cache CDN Vercel (hemat invocation & DB). */
export const PUBLIC_CACHE_HEADERS = {
    'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
};
export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };
