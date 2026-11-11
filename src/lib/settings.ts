import { getSupabaseAdmin } from './supabase';
import { memo, bust } from './cache';

export interface BannerItem {
    id: string;
    title: string;
    subtitle: string;
    badge: string;
    tagColor: string;
    slug: string;
    buttonText: string;
    bgGradient: string;
    image: string;
}

export interface SiteSettings {
    site_name: string;
    site_title: string;
    site_tagline: string;
    site_logo: string;
    announcement: string;
    announcement_active: boolean;
    whatsapp_cs: string;
    wijayapay_merchant_code: string;
    wijayapay_api_key: string;
    wijayapay_base_url: string;
    thanhub_base_url?: string;
    thanhub_api_key?: string;
    smtp_host?: string;
    smtp_port?: number;
    smtp_user?: string;
    smtp_pass?: string;
    smtp_from?: string;
    banners: BannerItem[];
    store_subtitle?: string;
    logo_text?: string;
    hero_title?: string;
    hero_desc?: string;
    telegram_cs?: string;
    telegram_label?: string;
    telegram_sub?: string;
    wa_channel?: string;
    wa_channel_label?: string;
    wa_channel_sub?: string;
    qris_image?: string;
    footer_text?: string;
    payment_gateway_provider?: 'wijayapay' | 'autogopay';
    autogopay_api_key?: string;
    autogopay_webhook_secret?: string;
    autogopay_base_url?: string;
    wijayapay_proxy_host?: string;
    wijayapay_proxy_port?: number;
    wijayapay_proxy_user?: string;
    wijayapay_proxy_pass?: string;
    wijayapay_proxy_enabled?: boolean;
    /* Notifikasi pembelian (social proof) di katalog */
    activity_enabled?: boolean;
    activity_display_sec?: number;
    activity_gap_sec?: number;
    activity_replay?: boolean;
    activity_max_items?: number;
    activity_max_age_hours?: number;
    activity_realtime?: boolean;
    activity_poll_sec?: number;
}

export const DEFAULT_SETTINGS: SiteSettings = {
    site_name: 'KENZIxCheat',
    site_title: 'KENZIxCheat Store — Open 24 Jam',
    site_tagline: 'STORE • OPEN 24 JAM',
    site_logo: '/images/logo.svg',
    store_subtitle: 'STORE • OPEN 24 JAM',
    logo_text: 'KX',
    hero_title: 'Selamat Datang di KENZIxCheat',
    hero_desc: 'Pilih produk, tentukan durasi, lalu bayar via QRIS. Key otomatis langsung terkirim di layar tanpa kirim bukti transfer.',
    announcement: 'STORE OPEN 24 JAM NONSTOP! Layanan Tercepat & Lisensi Resmi Terpercaya!',
    announcement_active: false,
    whatsapp_cs: '',
    telegram_cs: '',
    telegram_label: 'Customer Service',
    telegram_sub: '',
    wa_channel: '',
    wa_channel_label: 'Saluran WhatsApp',
    wa_channel_sub: 'Update produk & promo',
    qris_image: '',
    footer_text: 'Semua transaksi diproses otomatis 24 jam via QRIS.',
    payment_gateway_provider: 'wijayapay',
    autogopay_api_key: process.env.AUTOGOPAY_API_KEY || '',
    autogopay_webhook_secret: process.env.AUTOGOPAY_WEBHOOK_SECRET || '',
    autogopay_base_url: process.env.AUTOGOPAY_BASE_URL || 'https://autogopay.net',
    wijayapay_merchant_code: '',
    wijayapay_api_key: '',
    wijayapay_base_url: 'https://gateway.wijayapay.com',
    wijayapay_proxy_host: '',
    wijayapay_proxy_port: 3128,
    wijayapay_proxy_user: '',
    wijayapay_proxy_pass: '',
    wijayapay_proxy_enabled: false,
    activity_enabled: true,
    activity_display_sec: 6,
    activity_gap_sec: 10,
    activity_replay: true,
    activity_max_items: 10,
    activity_max_age_hours: 72,
    activity_realtime: true,
    activity_poll_sec: 30,
    thanhub_base_url: '',
    thanhub_api_key: '',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 465,
    smtp_user: '',
    smtp_pass: '',
    smtp_from: '',
    banners: [],
};

/** Field rahasia: tidak pernah dikirim utuh ke browser (hanya versi tersamar). */
export const SECRET_KEYS = [
    'wijayapay_api_key',
    'wijayapay_proxy_pass',
    'thanhub_api_key',
    'smtp_pass',
    'autogopay_api_key',
    'autogopay_webhook_secret',
] as const;

/** Field yang tidak boleh lagi disimpan di site_settings (sudah pindah ke tabel admin_users / env). */
const FORBIDDEN_KEYS = ['admin_pin', 'admin_username', 'admin_password', 'supabase_url', 'supabase_anon_key', 'supabase_service_key'];

export const MASK = '••••';
const SETTINGS_TTL_MS = 60_000;

function stripForbidden<T extends Record<string, any>>(obj: T): T {
    const out: any = { ...obj };
    for (const k of FORBIDDEN_KEYS) delete out[k];
    return out;
}

/**
 * Settings dibaca dari Supabase (1 baris) dan di-cache 60 detik per instance
 * supaya halaman ramai tidak menghabiskan kuota query Supabase gratisan.
 */
export async function getSiteSettings(): Promise<SiteSettings> {
    return memo('settings:main', SETTINGS_TTL_MS, async () => {
        const db = getSupabaseAdmin();
        if (db) {
            try {
                const { data, error } = await db.from('site_settings').select('value').eq('key', 'main_config').maybeSingle();
                if (!error && data?.value) {
                    const v = stripForbidden(data.value);
                    return {
                        ...DEFAULT_SETTINGS,
                        ...v,
                        banners: Array.isArray(v.banners) ? v.banners : DEFAULT_SETTINGS.banners,
                    } as SiteSettings;
                }
            } catch (e) {
                console.warn('Gagal ambil settings dari Supabase:', e);
            }
        }
        return { ...DEFAULT_SETTINGS };
    });
}

/** Simpan perubahan. Nilai rahasia yang masih berupa topeng (••••) diabaikan agar tidak menimpa nilai asli. */
export async function updateSiteSettings(updates: Partial<SiteSettings> & Record<string, any>): Promise<SiteSettings> {
    const current = await getSiteSettings();
    const clean: Record<string, any> = stripForbidden(updates);

    for (const k of SECRET_KEYS) {
        if (typeof clean[k] === 'string' && clean[k].startsWith(MASK)) delete clean[k];
    }
    if (clean.site_title && !clean.site_tagline) clean.site_tagline = clean.site_title;
    else if (clean.site_tagline && !clean.site_title) clean.site_title = clean.site_tagline;

    const updated = { ...current, ...clean } as SiteSettings;

    const db = getSupabaseAdmin();
    if (!db) throw new Error('Database belum dikonfigurasi.');
    const { error } = await db.from('site_settings').upsert({
        key: 'main_config',
        value: updated,
        updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Gagal menyimpan pengaturan: ${error.message}`);

    bust('settings:');
    return updated;
}

/** Versi untuk panel admin: rahasia disamarkan. */
export async function getAdminSettingsView(): Promise<Record<string, any>> {
    const s: Record<string, any> = stripForbidden(await getSiteSettings());
    for (const k of SECRET_KEYS) {
        const v = String(s[k] || '');
        s[k] = v ? MASK + v.slice(-4) : '';
    }
    s.has_secrets = Object.fromEntries(SECRET_KEYS.map((k) => [k, Boolean(String((s as any)[k] || ''))]));
    return s;
}

/** Versi publik: hanya data tampilan. */
export async function getPublicSettings() {
    const settings = await getSiteSettings();
    return {
        site_name: settings.site_name,
        site_title: settings.site_title,
        site_tagline: settings.site_tagline || settings.site_title,
        site_logo: settings.site_logo,
        announcement: settings.announcement,
        announcement_active: settings.announcement_active,
        whatsapp_cs: settings.whatsapp_cs,
        banners: settings.banners || [],
        store_subtitle: settings.store_subtitle || 'STORE • OPEN 24 JAM',
        logo_text: settings.logo_text || 'MX',
        hero_title: settings.hero_title || 'Selamat Datang di ' + settings.site_name,
        hero_desc: settings.hero_desc || '',
        telegram_cs: settings.telegram_cs || '',
        telegram_label: settings.telegram_label || 'Customer Service',
        telegram_sub: settings.telegram_sub || '',
        wa_channel: settings.wa_channel || '',
        wa_channel_label: settings.wa_channel_label || 'Saluran WhatsApp',
        wa_channel_sub: settings.wa_channel_sub || '',
        qris_image: settings.qris_image || '',
        footer_text: settings.footer_text || '',
    };
}
