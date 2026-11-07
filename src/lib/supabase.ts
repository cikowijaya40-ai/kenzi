import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Order } from './types';

/**
 * Koneksi database — SERVER ONLY.
 * Memakai SUPABASE_SERVICE_ROLE_KEY (rahasia). Tabel dikunci RLS tanpa policy,
 * jadi anon key tidak punya akses apa pun dan TIDAK dipakai di aplikasi ini.
 * Tidak ada lagi kredensial default di dalam kode.
 */
export function getSupabaseCredentials() {
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const isConfigured = Boolean(supabaseUrl.startsWith('http') && supabaseServiceKey.length > 20);
    return { supabaseUrl, supabaseServiceKey, isConfigured };
}

const g = globalThis as unknown as { __epepDb?: SupabaseClient };

export function getSupabaseAdmin(): SupabaseClient | null {
    const { supabaseUrl, supabaseServiceKey, isConfigured } = getSupabaseCredentials();
    if (!isConfigured) return null;
    if (!g.__epepDb) {
        g.__epepDb = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { fetch: (url: any, options: any = {}) => fetch(url, { ...options, cache: 'no-store' }) },
        });
    }
    return g.__epepDb;
}

/** Alias lama agar modul lain tetap jalan. Tidak ada klien anon lagi. */
export const getSupabase = getSupabaseAdmin;

export function requireDb(): SupabaseClient {
    const db = getSupabaseAdmin();
    if (!db) throw new Error('Database belum dikonfigurasi (SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY).');
    return db;
}

export const isSupabaseConfigured = getSupabaseCredentials().isConfigured;

export async function testSupabaseConnection(): Promise<{ connected: boolean; message: string }> {
    const db = getSupabaseAdmin();
    if (!db) return { connected: false, message: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diisi di Environment Variables.' };
    try {
        const { error } = await db.from('products').select('id', { head: true, count: 'exact' }).limit(1);
        if (error) return { connected: false, message: `Koneksi gagal: ${error.message}. Pastikan supabase/schema.sql sudah dijalankan.` };
        return { connected: true, message: 'Supabase terhubung.' };
    } catch (err: any) {
        return { connected: false, message: `Koneksi gagal: ${err.message}` };
    }
}

/* ───────── ORDERS ───────── */
const SAFE_ID = /^[A-Za-z0-9_-]{3,100}$/;

export async function saveOrder(order: Order & { user_id?: string }): Promise<Order> {
    const { data, error } = await requireDb().from('orders').insert([order]).select().single();
    if (error) throw new Error(`Gagal menyimpan pesanan: ${error.message}`);
    return data as Order;
}

export async function getOrder(identifier: string): Promise<Order | null> {
    const id = (identifier || '').trim();
    if (!SAFE_ID.test(id)) return null;
    // 1 query (bukan 2): cocokkan invoice_no ATAU ref_id sekaligus. SAFE_ID hanya mengizinkan huruf/angka/_/-,
    // jadi aman dipakai di filter .or(). Webhook mencari lewat ref_id, jadi sebelumnya selalu butuh 2 query.
    const { data } = await requireDb().from('orders').select('*').or(`invoice_no.eq.${id},ref_id.eq.${id}`).limit(1);
    return ((data && data[0]) as Order) || null;
}

export async function updateOrder(refId: string, updates: Partial<Order>): Promise<Order | null> {
    const { data, error } = await requireDb()
        .from('orders')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('ref_id', refId)
        .select()
        .single();
    if (error) {
        console.warn('Gagal update order:', error.message);
        return null;
    }
    return data as Order;
}

export async function updateOrderByInvoice(invoiceNo: string, updates: Partial<Order>): Promise<Order | null> {
    const { data, error } = await requireDb()
        .from('orders')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('invoice_no', invoiceNo)
        .select()
        .single();
    if (error) {
        console.warn('Gagal update order:', error.message);
        return null;
    }
    return data as Order;
}

/**
 * Kolom untuk DAFTAR pesanan di panel admin. payment_data (qr_string, tutorial pembayaran, dll.) sengaja
 * TIDAK ikut: panel admin tidak memakainya dan isinya besar → hemat egress Supabase tiap panel dimuat.
 */
const ADMIN_ORDER_COLS =
    'id, invoice_no, ref_id, product_slug, product_name, item_sku, item_name, user_id_game, zone_id, user_whatsapp, customer_email, user_id, ' +
    'amount, fee, total_amount, payment_method, payment_name, status, delivery_status, delivery_data, created_at, updated_at';

export async function getAllOrdersLite(limit = 100): Promise<Order[]> {
    const { data, error } = await requireDb().from('orders').select(ADMIN_ORDER_COLS).order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data || []) as unknown as Order[];
}

/** Hanya pesanan PENDING (untuk cek massal) — tidak perlu menarik 100 pesanan lalu memfilter di server. */
export async function getPendingOrders(limit = 100): Promise<Order[]> {
    const { data, error } = await requireDb().from('orders').select('*').eq('status', 'PENDING').order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data || []) as Order[];
}

export async function getAllOrders(limit = 100): Promise<Order[]> {
    const { data, error } = await requireDb().from('orders').select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data || []) as Order[];
}

export async function getOrdersByUser(userId: string, limit = 30): Promise<Order[]> {
    const { data, error } = await requireDb()
        .from('orders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw new Error(error.message);
    return (data || []) as Order[];
}

export async function deleteOrder(identifier: string): Promise<boolean> {
    const id = (identifier || '').trim();
    if (!SAFE_ID.test(id)) return false;
    const db = requireDb();
    await db.from('orders').delete().eq('invoice_no', id);
    await db.from('orders').delete().eq('ref_id', id);
    return true;
}
