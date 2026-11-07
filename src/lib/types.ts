export interface Category {
    id: string;
    name: string;
    slug: string;
    sort_order: number;
}

export interface ProductItem {
    id: string;
    product_slug: string;
    sku: string;
    name: string;
    original_price: number;
    price: number;
    cost_usd?: string;
    icon_url?: string;
    badge?: string;
    is_active: boolean;
    sort_order: number;
    stock?: number;
    in_stock?: boolean;
}

export interface Product {
    id: string;
    slug: string;
    name: string;
    publisher: string;
    category_slug: string;
    icon_url: string;
    banner_url?: string;
    description: string;
    badge?: string;
    input_label_1: string;
    input_placeholder_1: string;
    input_label_2?: string;
    input_placeholder_2?: string;
    has_zone_id: boolean;
    is_active: boolean;
    is_featured: boolean;
    /** Mode maintenance: produk tetap tampil di katalog, tapi tidak bisa dibeli. */
    maintenance?: boolean;
    /** Pesan opsional yang ditampilkan ke pembeli saat maintenance. */
    maintenance_note?: string | null;
    sort_order: number;
    items?: ProductItem[];
    /** Hanya dipakai server -> admin UI (tidak disimpan ke database). */
    _warning?: string;
}

export interface PaymentMethod {
    id: string;
    code: string;
    name: string;
    group_name: 'QRIS' | 'Virtual Account' | 'Retail' | 'E-Wallet' | 'Crypto';
    image_url: string;
    fee_amount: number;
    fee_percent: number;
    min_trx: number;
    max_trx: number;
    type_fee: 'customer' | 'merchant';
    tutorial_pembayaran?: string;
    is_active: boolean;
    status?: string;
}

export interface Order {
    id: string;
    invoice_no: string;
    ref_id: string;
    product_slug: string;
    product_name: string;
    item_sku: string;
    item_name: string;
    user_id_game: string;
    zone_id?: string;
    user_whatsapp: string;
    customer_email?: string;
    user_id?: string | null;
    amount: number;
    fee: number;
    total_amount: number;
    payment_method: string;
    payment_name: string;
    payment_data: {
        qr_image?: string;
        qr_string?: string;
        nomor_va?: string;
        nomor_pembayaran?: string;
        expired?: string;
        tutorial_pembayaran?: string;
        trx_reference?: string;
        [key: string]: any;
    };
    status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' | 'CANCELLED';
    delivery_status: 'PENDING' | 'DELIVERED' | 'FAILED';
    delivery_data?: {
        license_key?: string;
        keys?: string[];
        voucher_code?: string;
        message?: string;
        [key: string]: any;
    };
    created_at: string;
    updated_at?: string;
}

export interface AppUser {
    id: string;
    username: string;
    email: string;
    whatsapp?: string | null;
    balance: number;
    is_banned?: boolean;
    created_at?: string;
}

export interface LedgerEntry {
    id: number;
    kind: 'topup' | 'purchase' | 'refund' | 'admin_adjust';
    amount: number;
    balance_after: number;
    ref: string;
    note?: string | null;
    created_at: string;
}

export interface Topup {
    id: string;
    invoice_no: string;
    user_id: string;
    amount: number;
    fee: number;
    total_amount: number;
    gateway?: string;
    payment_method?: string;
    payment_name?: string;
    payment_data: Record<string, any>;
    status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' | 'CANCELLED';
    created_at: string;
    paid_at?: string | null;
}
