'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Settings,
    ShieldCheck,
    Gamepad2,
    Image as ImageIcon,
    Key,
    CreditCard,
    Database,
    Package,
    ListOrdered,
    Plus,
    Trash2,
    Edit3,
    Eye,
    EyeOff,
    Check,
    CheckCircle2,
    AlertCircle,
    RefreshCw,
    Search,
    Lock,
    Unlock,
    Save,
    ExternalLink,
    Copy,
    Sparkles,
    Clock,
    ArrowRight,
    X,
    Filter,
    Layers,
    Sliders,
    Percent,
    DollarSign,
    TrendingUp,
    CheckSquare,
    Square,
    Mail,
    Send,
    AlertTriangle,
    Globe
} from 'lucide-react';
import ImageFieldEditor from '@/components/ImageFieldEditor';
import AdminAccountCard from '@/components/AdminAccountCard';
import Turnstile from '@/components/Turnstile';
import { Product, ProductItem, Order } from '@/lib/types';
import type { SiteSettings, BannerItem } from '@/lib/settings';

interface FloatingDetail {
    label: string;
    value: string | React.ReactNode;
}

interface FloatingBulkItem {
    invoice_no: string;
    product_name?: string;
    total_amount: number;
    status: string;
    isPaid: boolean;
    message: string;
    licenseKey?: string;
}

interface FloatingModalData {
    isOpen: boolean;
    type: 'success' | 'error' | 'payment_not_detected' | 'payment_paid' | 'info';
    title: string;
    subtitle?: string;
    actionType?: string;
    targetName?: string;
    dbStatus?: 'updated' | 'error' | 'pending' | 'synced';
    dbTable?: string;
    message?: string;
    details?: FloatingDetail[];
    bulkDetails?: FloatingBulkItem[];
    primaryButton?: { text: string; onClick?: () => void };
    secondaryButton?: { text: string; onClick?: () => void };
}

export default function AdminDashboardPage() {
    // Auth State
    const [usernameInput, setUsernameInput] = useState('admin');
    const [passwordInput, setPasswordInput] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState('');
    const [adminToken, setAdminToken] = useState('');

    // Tab Navigation: 'settings' | 'banners' | 'products' | 'apikeys' | 'orders'
    const [activeTab, setActiveTab] = useState<'settings' | 'banners' | 'products' | 'apikeys' | 'orders'>('settings');

    // Data State
    const [settings, setSettings] = useState<SiteSettings | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [dbStatus, setDbStatus] = useState<any>(null);

    // UI Feedback
    const [loadingData, setLoadingData] = useState(false);
    const [saveLoading, setSaveLoading] = useState(false);
    const [testEmailLoading, setTestEmailLoading] = useState(false);
    const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showKeyWijaya, setShowKeyWijaya] = useState(false);
    const [showKeyAutogopay, setShowKeyAutogopay] = useState(false);
    const [showSecretAutogopay, setShowSecretAutogopay] = useState(false);
    const [autogopayTest, setAutogopayTest] = useState<{ loading: boolean; ok?: boolean; message?: string }>({ loading: false });

    // Modal Product State
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);

    // Modal SKU State
    const [isSkuModalOpen, setIsSkuModalOpen] = useState(false);
    const [selectedProductForSku, setSelectedProductForSku] = useState<Product | null>(null);
    const [editingSku, setEditingSku] = useState<Partial<ProductItem> | null>(null);

    // Modal Banner State
    const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
    const [editingBanner, setEditingBanner] = useState<Partial<BannerItem> | null>(null);

    // Modal Bulk Pricing State
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [bulkTargetMode, setBulkTargetMode] = useState<'ALL' | 'APKMOD' | 'IOS_ROOT' | 'CUSTOM'>('ALL');
    const [bulkSelectedSlugs, setBulkSelectedSlugs] = useState<string[]>([]);
    const [bulkMarkupType, setBulkMarkupType] = useState<'fixed' | 'percent'>('fixed');
    const [bulkMarkupValue, setBulkMarkupValue] = useState<number>(1000);
    const [bulkUsdRate, setBulkUsdRate] = useState<number>(16000);
    const [bulkRounding, setBulkRounding] = useState<number>(1000);
    const [bulkUpdateOriginalPrice, setBulkUpdateOriginalPrice] = useState<boolean>(true);
    const [bulkOriginalPercent, setBulkOriginalPercent] = useState<number>(25);
    const [bulkPreviewItems, setBulkPreviewItems] = useState<any[]>([]);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkPreviewLoading, setBulkPreviewLoading] = useState(false);
    const [bulkSearchProduct, setBulkSearchProduct] = useState('');

    // Filter & Search Products (Publik vs Private)
    const [productFilter, setProductFilter] = useState<'all' | 'public' | 'private'>('all');
    const [productSearch, setProductSearch] = useState('');
    const [visibilityTogglingSlug, setVisibilityTogglingSlug] = useState<string | null>(null);

    // Filter & Search Orders
    const [orderSearch, setOrderSearch] = useState('');
    const [orderFilterStatus, setOrderFilterStatus] = useState('ALL');

    // Floating Notification & Payment Modal State
    const [floatingModal, setFloatingModal] = useState<FloatingModalData>({
        isOpen: false,
        type: 'info',
        title: '',
    });
    const [checkingPaymentInvoice, setCheckingPaymentInvoice] = useState<string | null>(null);
    const [bulkCheckingPayment, setBulkCheckingPayment] = useState(false);

    const openFloatingModal = (data: Omit<FloatingModalData, 'isOpen'>) => {
        setFloatingModal({ ...data, isOpen: true });
    };

    const closeFloatingModal = () => {
        setFloatingModal(prev => ({ ...prev, isOpen: false }));
    };

    const [thBalance, setThBalance] = useState<number | null>(null);

    const showToast = (type: 'success' | 'error', text: string) => {
        setToastMessage({ type, text });
        setTimeout(() => setToastMessage(null), 4000);
    };

    // Helper request with Auth Header
    const authHeaders = () => {
        const token = adminToken || (typeof window !== 'undefined' ? localStorage.getItem('admin_token') || '' : '');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'x-admin-token': token,
            'x-admin-pin': token,
        };
    };

    // Check existing authentication on mount
    useEffect(() => {
        const savedToken = localStorage.getItem('admin_token') || '';
        if (savedToken) {
            setAdminToken(savedToken);
            verifyToken(savedToken);
        }
    }, []);

    const verifyToken = async (token: string) => {
        setAuthLoading(true);
        try {
            const res = await fetch('/api/admin/auth', {
                headers: { 'x-admin-pin': token },
            });
            const data = await res.json();
            if (data.authenticated) {
                setIsAuthenticated(true);
                setAdminToken(token);
                loadAllData(token);
            } else {
                localStorage.removeItem('admin_token');
                setIsAuthenticated(false);
            }
        } catch {
            setIsAuthenticated(false);
        } finally {
            setAuthLoading(false);
        }
    };

    const [tsToken, setTsToken] = useState('');
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthLoading(true);
        setAuthError('');

        try {
            const res = await fetch('/api/admin/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: usernameInput.trim(),
                    password: passwordInput.trim(),
                    turnstileToken: tsToken,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setIsAuthenticated(true);
                const token = 'session'; // sesi disimpan di cookie httpOnly, bukan di JavaScript
                setAdminToken(token);
                localStorage.setItem('admin_token', token);
                showToast('success', 'Selamat datang di Panel Pengelola Toko!');
                loadAllData(token);
            } else {
                setAuthError(data.message || 'Username atau Password Admin salah!');
            }
        } catch (err: any) {
            setAuthError(err.message || 'Gagal login admin');
        } finally {
            setAuthLoading(false);
        }
    };

    const handleLogout = () => {
        fetch('/api/admin/auth', { method: 'DELETE' }).catch(() => { });
        localStorage.removeItem('admin_token');
        setIsAuthenticated(false);
        setAdminToken('');
        setPasswordInput('');
    };

    // Status DB (/api/setup) & saldo Thanhub tidak berubah akibat edit produk/pengaturan, jadi cukup dimuat sekali per sesi
    // (kecuali tombol Refresh ditekan). Sebelumnya SETIAP simpan memicu 5 request; sekarang 3.
    const extrasLoadedRef = React.useRef(false);
    const loadAllData = async (token = adminToken, force = false) => {
        setLoadingData(true);
        const headers = { 'x-admin-pin': token };

        try {
            // Load Settings
            const setRes = await fetch('/api/admin/settings', { headers });
            const setData = await setRes.json();
            if (setData.success) setSettings(setData.data);

            // Load Products
            const prodRes = await fetch('/api/admin/products', { headers });
            const prodData = await prodRes.json();
            if (prodData.success) setProducts(prodData.data);

            // Load Orders
            const ordRes = await fetch('/api/admin/orders', { headers });
            const ordData = await ordRes.json();
            if (ordData.success) setOrders(ordData.data);

            if (force || !extrasLoadedRef.current) {
                // Check Supabase status
                const dbRes = await fetch('/api/setup');
                const dbJson = await dbRes.json();
                setDbStatus(dbJson);

                // Saldo Thanhub (opsional)
                try {
                    const tRes = await fetch('/api/admin/thanhub', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'balance' }) });
                    const tJson = await tRes.json();
                    if (tJson.success) setThBalance(Number(tJson.balance) || 0);
                } catch (err) {
                    console.warn('Could not fetch Thanhub balance:', err);
                }
                extrasLoadedRef.current = true;
            }
        } catch (e: any) {
            showToast('error', 'Gagal memuat data dashboard: ' + e.message);
        } finally {
            setLoadingData(false);
        }
    };

    // -------------------------------------------------------------
    // SAVE SETTINGS HANDLER
    // -------------------------------------------------------------
    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;

        setSaveLoading(true);
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(settings),
            });
            const data = await res.json();
            if (data.success) {
                showToast('success', 'Pengaturan berhasil disimpan!');
                openFloatingModal({
                    type: 'success',
                    title: 'Database Supabase Berhasil Di-Update!',
                    subtitle: 'Pengaturan website, API Key Wijayapay/AutoGopay, kontak WhatsApp & PIN keamanan telah tersimpan permanen di cloud.',
                    actionType: 'Update Site Settings',
                    targetName: settings.site_name || 'Konfigurasi Website',
                    dbStatus: 'updated',
                    dbTable: 'site_settings',
                    details: [
                        { label: 'Nama Website', value: settings.site_name || '-' },
                        { label: 'Payment Gateway', value: (settings.payment_gateway_provider || 'autogopay') === 'wijayapay' ? 'WijayaPay (Aktif)' : 'AutoGopay (Aktif)' },
                        { label: 'AutoGopay Key', value: settings.autogopay_api_key ? `${settings.autogopay_api_key.substring(0, 10)}...` : 'Belum diatur' },
                        { label: 'WijayaPay Key', value: settings.wijayapay_api_key ? `${settings.wijayapay_api_key.substring(0, 14)}...` : 'Belum diatur' },
                        { label: 'Status Database', value: '✓ Tersimpan di Supabase Cloud' },
                    ],
                });
                loadAllData();
            } else {
                showToast('error', data.message || 'Gagal menyimpan pengaturan');
                openFloatingModal({
                    type: 'error',
                    title: 'Database Gagal Di-Update',
                    subtitle: data.message || 'Terjadi kesalahan saat menyimpan pengaturan ke Supabase.',
                    actionType: 'Update Site Settings',
                    targetName: 'Pengaturan Website',
                    dbStatus: 'error',
                    dbTable: 'site_settings',
                    message: data.message,
                    details: [
                        { label: 'Penyebab Error', value: data.message || 'Koneksi database atau validasi gagal' },
                    ],
                });
            }
        } catch (e: any) {
            showToast('error', e.message);
            openFloatingModal({
                type: 'error',
                title: 'Database Gagal Di-Update',
                subtitle: e.message,
                actionType: 'Update Site Settings',
                targetName: 'Pengaturan Website',
                dbStatus: 'error',
                details: [{ label: 'Error Exception', value: e.message }],
            });
        } finally {
            setSaveLoading(false);
        }
    };

    // -------------------------------------------------------------
    // TEST EMAIL HANDLER
    // -------------------------------------------------------------
    const handleTestEmail = async () => {
        if (!settings?.smtp_user || !settings?.smtp_pass) {
            showToast('error', 'Harap isi Email Pengirim dan Google App Password terlebih dahulu');
            return;
        }

        setTestEmailLoading(true);
        try {
            const res = await fetch('/api/admin/test-email', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    smtp_user: settings.smtp_user,
                    smtp_pass: settings.smtp_pass,
                    smtp_host: settings.smtp_host,
                    smtp_port: settings.smtp_port,
                    smtp_from: settings.smtp_from,
                }),
            });
            const data = await res.json();
            if (data.success) {
                showToast('success', data.message);
            } else {
                showToast('error', data.message || 'Gagal mengetes koneksi SMTP');
            }
        } catch (e: any) {
            showToast('error', e.message);
        } finally {
            setTestEmailLoading(false);
        }
    };

    // -------------------------------------------------------------
    // PRODUCT CRUD HANDLERS
    // -------------------------------------------------------------
    const openCreateProductModal = () => {
        setEditingProduct({
            name: '',
            slug: '',
            publisher: 'Garena',
            category_slug: 'game-populer',
            icon_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&q=80',
            banner_url: '',
            description: '',
            badge: 'POPULER',
            input_label_1: 'User ID',
            input_placeholder_1: 'Masukkan ID Akun',
            has_zone_id: false,
            input_label_2: 'Zone ID',
            input_placeholder_2: 'Masukkan Zone ID',
            is_active: true,
            is_featured: true,
            maintenance: false,
            maintenance_note: '',
            sort_order: products.length + 1,
            items: [],
        });
        setIsProductModalOpen(true);
    };

    const openEditProductModal = (prod: Product) => {
        setEditingProduct({ ...prod });
        setIsProductModalOpen(true);
    };

    const handleSaveProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProduct) return;

        setSaveLoading(true);
        const isEdit = Boolean(editingProduct.id && products.some(p => p.slug === editingProduct.slug));

        try {
            const res = await fetch('/api/admin/products', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ ...editingProduct, isEdit }),
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.warning ? 'error' : 'success', data.warning || (isEdit ? 'Produk berhasil diperbarui!' : 'Produk baru berhasil ditambahkan!'));
                openFloatingModal({
                    type: 'success',
                    title: 'Database Supabase Berhasil Di-Update!',
                    subtitle: `Produk "${editingProduct.name}" berhasil ${isEdit ? 'diperbarui' : 'ditambahkan'} ke database Supabase.`,
                    actionType: isEdit ? 'Ubah Informasi Produk' : 'Tambah Produk Baru',
                    targetName: editingProduct.name || editingProduct.slug,
                    dbStatus: 'updated',
                    dbTable: 'products',
                    details: [
                        { label: 'Nama Produk', value: editingProduct.name || '-' },
                        { label: 'Slug Produk', value: editingProduct.slug || '-' },
                        { label: 'Publisher / Dev', value: editingProduct.publisher || '-' },
                        { label: 'Status Produk', value: editingProduct.is_active ? 'Aktif (Dijual)' : 'Nonaktif (Draft)' },
                        { label: 'Mode Maintenance', value: data.warning ? '⚠ Belum tersimpan (jalankan migrasi SQL)' : editingProduct.maintenance ? '🛠️ ON (tidak bisa dibeli)' : 'OFF (normal)' },
                        ...(data.warning ? [{ label: 'Peringatan', value: data.warning }] : []),
                        { label: 'Status Database', value: '✓ Berhasil Disimpan ke Supabase' },
                    ],
                });
                setIsProductModalOpen(false);
                setEditingProduct(null);
                loadAllData();
            } else {
                showToast('error', data.message || 'Gagal menyimpan produk');
                openFloatingModal({
                    type: 'error',
                    title: 'Database Gagal Di-Update',
                    subtitle: data.message || 'Gagal menyimpan perubahan data produk ke Supabase.',
                    actionType: 'Update Produk',
                    targetName: editingProduct.name || editingProduct.slug,
                    dbStatus: 'error',
                    dbTable: 'products',
                    message: data.message,
                    details: [
                        { label: 'Penyebab Error', value: data.message || 'Validasi gagal atau kesalahan query' },
                    ],
                });
            }
        } catch (e: any) {
            showToast('error', e.message);
            openFloatingModal({
                type: 'error',
                title: 'Database Gagal Di-Update',
                subtitle: e.message,
                actionType: 'Update Produk',
                targetName: editingProduct.name || editingProduct.slug,
                dbStatus: 'error',
                details: [{ label: 'Error Detail', value: e.message }],
            });
        } finally {
            setSaveLoading(false);
        }
    };

    const handleToggleProductVisibility = async (prod: Product) => {
        const newStatus = !prod.is_active;
        setVisibilityTogglingSlug(prod.slug);

        // Optimistic UI update
        setProducts((prev) =>
            prev.map((p) => (p.slug === prod.slug ? { ...p, is_active: newStatus } : p))
        );

        try {
            const res = await fetch('/api/admin/products', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    isEdit: true,
                    slug: prod.slug,
                    is_active: newStatus,
                }),
            });
            const data = await res.json();
            if (data.success) {
                showToast(
                    'success',
                    newStatus
                        ? `Produk "${prod.name}" sekarang PUBLIK (Tampil di Web)`
                        : `Produk "${prod.name}" sekarang PRIVATE (Tersembunyi dari Publik)`
                );
            } else {
                showToast('error', data.message || 'Gagal mengubah visibilitas');
                // Rollback
                setProducts((prev) =>
                    prev.map((p) => (p.slug === prod.slug ? { ...p, is_active: !newStatus } : p))
                );
            }
        } catch (e: any) {
            showToast('error', e.message);
            setProducts((prev) =>
                prev.map((p) => (p.slug === prod.slug ? { ...p, is_active: !newStatus } : p))
            );
        } finally {
            setVisibilityTogglingSlug(null);
        }
    };

    const handleDeleteProduct = async (slug: string, name: string) => {
        if (!confirm(`Yakin ingin menghapus produk "${name}"? Semua item nominal di dalamnya juga akan terhapus.`)) {
            return;
        }

        try {
            const res = await fetch(`/api/admin/products?slug=${encodeURIComponent(slug)}`, {
                method: 'DELETE',
                headers: authHeaders(),
            });
            const data = await res.json();
            if (data.success) {
                showToast('success', 'Produk berhasil dihapus');
                openFloatingModal({
                    type: 'success',
                    title: 'Database Berhasil Di-Update (Hapus Produk)',
                    subtitle: `Produk "${name}" dan varian di dalamnya berhasil dihapus dari database Supabase.`,
                    actionType: 'Hapus Produk',
                    targetName: name,
                    dbStatus: 'updated',
                    dbTable: 'products & skus',
                    details: [
                        { label: 'Nama Produk', value: name },
                        { label: 'Slug Terhapus', value: slug },
                        { label: 'Status Database', value: '✓ Terhapus Permanen dari Supabase' },
                    ],
                });
                loadAllData();
            } else {
                showToast('error', data.message);
                openFloatingModal({
                    type: 'error',
                    title: 'Gagal Hapus Produk',
                    subtitle: data.message || 'Terjadi kesalahan saat menghapus produk dari database.',
                    actionType: 'Hapus Produk',
                    targetName: name,
                    dbStatus: 'error',
                    details: [{ label: 'Error Detail', value: data.message }],
                });
            }
        } catch (e: any) {
            showToast('error', e.message);
        }
    };

    // -------------------------------------------------------------
    // SKU CRUD HANDLERS
    // -------------------------------------------------------------
    const openSkuManager = (prod: Product) => {
        setSelectedProductForSku(prod);
        setEditingSku(null);
        setIsSkuModalOpen(true);
    };

    const handleSaveSku = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProductForSku || !editingSku) return;

        setSaveLoading(true);
        const isEdit = Boolean(
            editingSku.id &&
            selectedProductForSku.items?.some(i => i.id === editingSku.id || (editingSku.sku && i.sku === editingSku.sku))
        );

        try {
            const res = await fetch('/api/admin/items', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    productSlug: selectedProductForSku.slug,
                    itemId: editingSku.id || editingSku.sku,
                    isEdit,
                    ...editingSku,
                }),
            });
            const data = await res.json();
            if (data.success) {
                showToast('success', isEdit ? 'Item SKU berhasil diupdate!' : 'Item SKU baru berhasil ditambahkan!');
                openFloatingModal({
                    type: 'success',
                    title: 'Database Supabase Berhasil Di-Update!',
                    subtitle: `Varian SKU "${editingSku.name || editingSku.sku}" untuk produk "${selectedProductForSku.name}" berhasil disimpan ke database.`,
                    actionType: isEdit ? 'Ubah Harga & Info SKU' : 'Tambah SKU Baru',
                    targetName: `${selectedProductForSku.name} - ${editingSku.name || editingSku.sku}`,
                    dbStatus: 'updated',
                    dbTable: 'skus',
                    details: [
                        { label: 'Produk Induk', value: selectedProductForSku.name },
                        { label: 'Nama Varian SKU', value: editingSku.name || '-' },
                        { label: 'Harga Jual (IDR)', value: `Rp ${Number(editingSku.price || 0).toLocaleString('id-ID')}` },
                        { label: 'Modal (USD)', value: editingSku.cost_usd ? `$${editingSku.cost_usd}` : '-' },
                        { label: 'Badge / Label', value: editingSku.badge || 'PROMO' },
                        { label: 'Status Database', value: '✓ Berhasil Disimpan ke Supabase' },
                    ],
                });
                setEditingSku(null);
                await loadAllData();
                // refresh selected product items in modal
                const prodRes = await fetch('/api/admin/products', { headers: authHeaders() });
                const prodJson = await prodRes.json();
                if (prodJson.success && Array.isArray(prodJson.data)) {
                    const updatedProd = prodJson.data.find(
                        (p: Product) => p.slug === selectedProductForSku.slug
                    );
                    if (updatedProd) setSelectedProductForSku(updatedProd);
                }
            } else {
                showToast('error', data.message || 'Gagal menyimpan item SKU');
                openFloatingModal({
                    type: 'error',
                    title: 'Database Gagal Di-Update',
                    subtitle: data.message || 'Gagal menyimpan perubahan SKU ke database.',
                    actionType: 'Update SKU',
                    targetName: editingSku.name || editingSku.sku || 'SKU Varian',
                    dbStatus: 'error',
                    dbTable: 'skus',
                    message: data.message,
                    details: [
                        { label: 'Penyebab Error', value: data.message || 'Kesalahan validasi atau database' },
                    ],
                });
            }
        } catch (e: any) {
            showToast('error', e.message);
            openFloatingModal({
                type: 'error',
                title: 'Database Gagal Di-Update',
                subtitle: e.message,
                actionType: 'Update SKU',
                targetName: editingSku.name || editingSku.sku || 'SKU Varian',
                dbStatus: 'error',
                details: [{ label: 'Error Detail', value: e.message }],
            });
        } finally {
            setSaveLoading(false);
        }
    };

    const handleDeleteSku = async (itemId: string) => {
        if (!selectedProductForSku) return;
        if (!confirm('Hapus item SKU nominal ini?')) return;

        try {
            const res = await fetch(`/api/admin/items?productSlug=${selectedProductForSku.slug}&itemId=${itemId}`, {
                method: 'DELETE',
                headers: authHeaders(),
            });
            const data = await res.json();
            if (data.success) {
                showToast('success', 'Item SKU dihapus');
                openFloatingModal({
                    type: 'success',
                    title: 'Database Berhasil Di-Update (Hapus SKU)',
                    subtitle: `Item SKU ID "${itemId}" dari produk "${selectedProductForSku.name}" berhasil dihapus dari database Supabase.`,
                    actionType: 'Hapus SKU',
                    targetName: itemId,
                    dbStatus: 'updated',
                    dbTable: 'skus',
                    details: [
                        { label: 'Produk Induk', value: selectedProductForSku.name },
                        { label: 'ID SKU Terhapus', value: itemId },
                        { label: 'Status Database', value: '✓ Terhapus Permanen dari Supabase' },
                    ],
                });
                await loadAllData();
                const prodRes = await fetch('/api/admin/products', { headers: authHeaders() });
                const prodJson = await prodRes.json();
                if (prodJson.success && Array.isArray(prodJson.data)) {
                    const updatedProd = prodJson.data.find(
                        (p: Product) => p.slug === selectedProductForSku.slug
                    );
                    if (updatedProd) setSelectedProductForSku(updatedProd);
                }
            } else {
                showToast('error', data.message);
                openFloatingModal({
                    type: 'error',
                    title: 'Gagal Hapus SKU',
                    subtitle: data.message || 'Gagal menghapus SKU dari database.',
                    actionType: 'Hapus SKU',
                    dbStatus: 'error',
                    details: [{ label: 'Error Detail', value: data.message }],
                });
            }
        } catch (e: any) {
            showToast('error', e.message);
        }
    };

    // -------------------------------------------------------------
    // BANNER CRUD HANDLERS
    // -------------------------------------------------------------
    const openAddBannerModal = () => {
        setEditingBanner({
            id: `banner-${Date.now()}`,
            title: '',
            subtitle: '',
            badge: 'PROMO SPESIAL',
            tagColor: 'bg-blue-600',
            slug: 'abcd-panel-apkmod',
            buttonText: 'Beli Sekarang',
            bgGradient: 'from-blue-900/90 via-blue-950/80 to-[#060a1c]',
            image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&q=80',
        });
        setIsBannerModalOpen(true);
    };

    const openEditBannerModal = (banner: BannerItem) => {
        setEditingBanner({ ...banner });
        setIsBannerModalOpen(true);
    };

    const handleSaveBanner = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingBanner || !settings) return;

        const currentBanners = settings.banners || [];
        const index = currentBanners.findIndex(b => b.id === editingBanner.id);

        let newBanners: BannerItem[];
        if (index > -1) {
            newBanners = [...currentBanners];
            newBanners[index] = editingBanner as BannerItem;
        } else {
            newBanners = [...currentBanners, editingBanner as BannerItem];
        }

        const updatedSettings = { ...settings, banners: newBanners };
        setSettings(updatedSettings);

        setSaveLoading(true);
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(updatedSettings),
            });
            const data = await res.json();
            if (data.success) {
                showToast('success', 'Banner berhasil disimpan!');
                openFloatingModal({
                    type: 'success',
                    title: 'Database Supabase Berhasil Di-Update!',
                    subtitle: `Banner promosi "${editingBanner.title || 'Banner Baru'}" berhasil disimpan ke Supabase Cloud.`,
                    actionType: 'Ubah Banner Promosi',
                    targetName: editingBanner.title || 'Banner Baru',
                    dbStatus: 'updated',
                    dbTable: 'site_settings (banners)',
                    details: [
                        { label: 'Judul Banner', value: editingBanner.title || '-' },
                        { label: 'Link Produk / Slug', value: editingBanner.slug || '-' },
                        { label: 'Badge', value: editingBanner.badge || '-' },
                        { label: 'Status Database', value: '✓ Tersimpan di Supabase Cloud' },
                    ],
                });
                setIsBannerModalOpen(false);
                setEditingBanner(null);
            } else {
                showToast('error', data.message);
                openFloatingModal({
                    type: 'error',
                    title: 'Database Gagal Di-Update',
                    subtitle: data.message || 'Gagal menyimpan konfigurasi banner ke Supabase.',
                    actionType: 'Update Banner',
                    dbStatus: 'error',
                    dbTable: 'site_settings',
                    details: [{ label: 'Error Detail', value: data.message }],
                });
            }
        } catch (e: any) {
            showToast('error', e.message);
        } finally {
            setSaveLoading(false);
        }
    };

    const handleDeleteBanner = async (bannerId: string) => {
        if (!settings || !confirm('Hapus banner ini?')) return;
        const newBanners = settings.banners.filter(b => b.id !== bannerId);
        const updatedSettings = { ...settings, banners: newBanners };
        setSettings(updatedSettings);

        try {
            await fetch('/api/admin/settings', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(updatedSettings),
            });
            showToast('success', 'Banner berhasil dihapus');
            openFloatingModal({
                type: 'success',
                title: 'Database Supabase Berhasil Di-Update!',
                subtitle: 'Banner promosi berhasil dihapus dari pengaturan website.',
                actionType: 'Hapus Banner Promosi',
                targetName: bannerId,
                dbStatus: 'updated',
                dbTable: 'site_settings (banners)',
                details: [
                    { label: 'ID Banner', value: bannerId },
                    { label: 'Status Database', value: '✓ Terhapus Permanen dari Supabase' },
                ],
            });
        } catch (e: any) {
            showToast('error', e.message);
        }
    };

    // -------------------------------------------------------------
    // BULK PRICING HANDLERS
    // -------------------------------------------------------------
    const getTargetSlugs = () => {
        if (bulkTargetMode === 'ALL') return ['ALL'];
        if (bulkTargetMode === 'APKMOD') {
            return products
                .filter(p => p.slug.includes('apkmod') || p.slug.includes('proxy') || p.slug.includes('wire') || p.slug.includes('mod') || (p.badge?.includes('APK') ?? false))
                .map(p => p.slug);
        }
        if (bulkTargetMode === 'IOS_ROOT') {
            return products
                .filter(p => p.slug.includes('ios') || p.slug.includes('root') || p.slug.includes('pc') || p.slug.includes('gbox') || (p.badge?.includes('iOS') ?? false) || (p.badge?.includes('ROOT') ?? false))
                .map(p => p.slug);
        }
        return bulkSelectedSlugs;
    };

    const openBulkPricingModal = () => {
        setIsBulkModalOpen(true);
        if (bulkSelectedSlugs.length === 0) {
            setBulkSelectedSlugs(products.map(p => p.slug));
        }
        setTimeout(() => {
            fetchBulkPreview();
        }, 100);
    };

    const fetchBulkPreview = async (
        override?: Partial<{
            mode: 'ALL' | 'APKMOD' | 'IOS_ROOT' | 'CUSTOM';
            slugs: string[];
            type: 'fixed' | 'percent';
            val: number;
            usd: number;
            round: number;
        }>
    ) => {
        setBulkPreviewLoading(true);
        try {
            const currentMode = override?.mode || bulkTargetMode;
            let slugs: string[] = [];
            if (currentMode === 'ALL') slugs = ['ALL'];
            else if (currentMode === 'APKMOD') {
                slugs = products
                    .filter(p => p.slug.includes('apkmod') || p.slug.includes('proxy') || p.slug.includes('wire') || p.slug.includes('mod') || (p.badge?.includes('APK') ?? false))
                    .map(p => p.slug);
            } else if (currentMode === 'IOS_ROOT') {
                slugs = products
                    .filter(p => p.slug.includes('ios') || p.slug.includes('root') || p.slug.includes('pc') || p.slug.includes('gbox') || (p.badge?.includes('iOS') ?? false) || (p.badge?.includes('ROOT') ?? false))
                    .map(p => p.slug);
            } else {
                slugs = override?.slugs || bulkSelectedSlugs;
            }

            const payload = {
                targetSlugs: slugs,
                markupType: override?.type || bulkMarkupType,
                markupValue: override?.val !== undefined ? override.val : bulkMarkupValue,
                usdRate: override?.usd !== undefined ? override.usd : bulkUsdRate,
                rounding: override?.round !== undefined ? override.round : bulkRounding,
                updateOriginalPrice: bulkUpdateOriginalPrice,
                originalPricePercent: bulkOriginalPercent,
                preview: true,
            };

            const res = await fetch('/api/admin/products/bulk-pricing', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success && Array.isArray(data.previewItems)) {
                setBulkPreviewItems(data.previewItems);
            }
        } catch (e) {
            console.warn('Gagal fetch preview bulk pricing:', e);
        } finally {
            setBulkPreviewLoading(false);
        }
    };

    const handleApplyBulkPricing = async () => {
        const slugs = getTargetSlugs();
        if (slugs.length === 0 && bulkTargetMode === 'CUSTOM') {
            showToast('error', 'Pilih minimal satu produk untuk diatur harganya');
            return;
        }

        const countText = bulkTargetMode === 'ALL'
            ? `SEMUA ${products.length} produk`
            : bulkTargetMode === 'APKMOD'
                ? 'Produk APK Mod Android'
                : bulkTargetMode === 'IOS_ROOT'
                    ? 'Produk iOS & Root Panel'
                    : `${slugs.length} produk pilihan`;

        const profitDesc = bulkMarkupType === 'fixed'
            ? `Untung Rp ${Number(bulkMarkupValue).toLocaleString('id-ID')} per SKU`
            : `Untung +${bulkMarkupValue}% per SKU`;

        if (!confirm(`Terapkan harga massal (${profitDesc}) untuk ${countText}? Perubahan harga akan langsung aktif di web dan Supabase!`)) {
            return;
        }

        setBulkLoading(true);
        try {
            const payload = {
                targetSlugs: slugs,
                markupType: bulkMarkupType,
                markupValue: bulkMarkupValue,
                usdRate: bulkUsdRate,
                rounding: bulkRounding,
                updateOriginalPrice: bulkUpdateOriginalPrice,
                originalPricePercent: bulkOriginalPercent,
                preview: false,
            };

            const res = await fetch('/api/admin/products/bulk-pricing', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                showToast('success', data.message || 'Harga massal berhasil diterapkan!');
                openFloatingModal({
                    type: 'success',
                    title: 'Database Supabase Berhasil Di-Update!',
                    subtitle: data.message || 'Perubahan harga seluruh SKU produk telah berhasil disimpan ke database Supabase.',
                    actionType: 'Update Harga Massal',
                    targetName: countText,
                    dbStatus: 'updated',
                    dbTable: 'skus (bulk update)',
                    details: [
                        { label: 'Target Produk', value: countText },
                        { label: 'Skema Keuntungan', value: profitDesc },
                        { label: 'Kurs USD Digunakan', value: `Rp ${Number(bulkUsdRate).toLocaleString('id-ID')}` },
                        { label: 'Pembulatan Harga', value: `Rp ${Number(bulkRounding).toLocaleString('id-ID')}` },
                        { label: 'Status Database', value: '✓ Berhasil Disimpan ke Supabase' },
                    ],
                });
                setIsBulkModalOpen(false);
                await loadAllData();
            } else {
                showToast('error', data.message || 'Gagal menerapkan harga massal');
                openFloatingModal({
                    type: 'error',
                    title: 'Gagal Update Harga Massal',
                    subtitle: data.message || 'Terjadi kesalahan sistem saat memperbarui harga massal.',
                    actionType: 'Update Harga Massal',
                    targetName: countText,
                    dbStatus: 'error',
                    dbTable: 'skus',
                    details: [{ label: 'Error Detail', value: data.message || 'Validasi / koneksi gagal' }],
                });
            }
        } catch (e: any) {
            showToast('error', e.message || 'Terjadi kesalahan sistem');
        } finally {
            setBulkLoading(false);
        }
    };

    // -------------------------------------------------------------
    // ORDER ACTIONS HANDLER
    // -------------------------------------------------------------
    const handleOrderAction = async (action: 'mark_paid' | 'regen_license' | 'delete', identifier: string) => {
        if (action === 'delete' && !confirm(`Hapus transaksi invoice ${identifier}?`)) return;

        try {
            if (action === 'delete') {
                const res = await fetch(`/api/admin/orders?identifier=${identifier}`, {
                    method: 'DELETE',
                    headers: authHeaders(),
                });
                const data = await res.json();
                if (data.success) {
                    showToast('success', 'Pesanan dihapus');
                    openFloatingModal({
                        type: 'success',
                        title: 'Database Berhasil Di-Update (Hapus Pesanan)',
                        subtitle: `Transaksi pesanan invoice ${identifier} berhasil dihapus dari database Supabase.`,
                        actionType: 'Hapus Pesanan',
                        targetName: identifier,
                        dbStatus: 'updated',
                        dbTable: 'orders',
                        details: [
                            { label: 'Nomor Invoice', value: identifier },
                            { label: 'Status Database', value: '✓ Terhapus Permanen dari Supabase' },
                        ],
                    });
                    loadAllData();
                } else {
                    showToast('error', data.message);
                    openFloatingModal({
                        type: 'error',
                        title: 'Gagal Hapus Pesanan',
                        subtitle: data.message || 'Terjadi kesalahan saat menghapus pesanan.',
                        actionType: 'Hapus Pesanan',
                        targetName: identifier,
                        dbStatus: 'error',
                        details: [{ label: 'Error Detail', value: data.message }],
                    });
                }
            } else {
                const res = await fetch('/api/admin/orders', {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({ action, identifier }),
                });
                const data = await res.json();
                if (data.success) {
                    showToast('success', data.message);
                    if (action === 'mark_paid') {
                        openFloatingModal({
                            type: 'payment_paid',
                            title: 'Status Pesanan Berhasil Diubah ke LUNAS!',
                            subtitle: `Pesanan invoice ${identifier} berhasil ditandai LUNAS di database Supabase dan lisensi key telah diterbitkan.`,
                            actionType: 'Set Lunas Manual',
                            targetName: identifier,
                            dbStatus: 'updated',
                            dbTable: 'orders (PAID)',
                            details: [
                                { label: 'Nomor Invoice', value: identifier },
                                { label: 'Status Baru', value: 'PAID (LUNAS)' },
                                { label: 'Lisensi Key', value: data.data?.delivery_data?.license_key || 'Diterbitkan & Siap Pakai' },
                                { label: 'Status Database', value: '✓ Berhasil Disimpan ke Supabase' },
                            ],
                        });
                    } else if (action === 'regen_license') {
                        openFloatingModal({
                            type: 'success',
                            title: 'Lisensi Key Berhasil Di-Generate Ulang!',
                            subtitle: `Lisensi baru dari Thanhub berhasil digenerate dan tersimpan di database untuk invoice ${identifier}.`,
                            actionType: 'Ubah / Refresh Key Lisensi',
                            targetName: identifier,
                            dbStatus: 'updated',
                            dbTable: 'orders (license_key)',
                            details: [
                                { label: 'Nomor Invoice', value: identifier },
                                { label: 'Lisensi Key Baru', value: data.data?.delivery_data?.license_key || '-' },
                                { label: 'Status Database', value: '✓ Berhasil Disimpan ke Supabase' },
                            ],
                        });
                    }
                    loadAllData();
                } else {
                    showToast('error', data.message);
                    openFloatingModal({
                        type: 'error',
                        title: 'Gagal Memproses Pesanan',
                        subtitle: data.message || 'Terjadi kesalahan saat memproses aksi pesanan.',
                        actionType: 'Aksi Pesanan',
                        targetName: identifier,
                        dbStatus: 'error',
                        details: [{ label: 'Error Detail', value: data.message }],
                    });
                }
            }
        } catch (e: any) {
            showToast('error', e.message);
        }
    };

    // -------------------------------------------------------------
    // CHECK PAYMENT HANDLER (SINGLE ORDER)
    // -------------------------------------------------------------
    const handleCheckPayment = async (invoiceNo: string) => {
        setCheckingPaymentInvoice(invoiceNo);
        try {
            const res = await fetch('/api/admin/orders', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ action: 'check_payment', identifier: invoiceNo }),
            });
            const data = await res.json();
            if (data.success) {
                if (data.isPaid) {
                    showToast('success', 'Pembayaran terdeteksi LUNAS!');
                    openFloatingModal({
                        type: 'payment_paid',
                        title: 'Pembayaran Berhasil Terdeteksi (LUNAS)!',
                        subtitle: `Dana pembayaran untuk invoice ${invoiceNo} telah masuk dan terkonfirmasi di payment gateway Wijayapay.`,
                        actionType: 'Cek Pembayaran Gateway',
                        targetName: invoiceNo,
                        dbStatus: 'updated',
                        dbTable: 'orders (PAID)',
                        details: [
                            { label: 'Nomor Invoice', value: invoiceNo },
                            { label: 'Status Gateway', value: 'PAID (LUNAS / TERVERIFIKASI)' },
                            { label: 'Total Nominal', value: `Rp ${Number(data.data?.total_amount || 0).toLocaleString('id-ID')}` },
                            { label: 'Lisensi Key Terbit', value: data.licenseKey || data.data?.delivery_data?.license_key || 'Diterbitkan & Aktif' },
                            { label: 'Status Database', value: '✓ Status LUNAS Berhasil Di-Update ke Supabase' },
                        ],
                    });
                    await loadAllData();
                } else {
                    showToast('error', 'Pembayaran belum terdeteksi di gateway');
                    openFloatingModal({
                        type: 'payment_not_detected',
                        title: 'Pembayaran Belum Terdeteksi',
                        subtitle: `Sistem telah memeriksa payment gateway Wijayapay & mutasi bank, namun belum ada dana masuk untuk invoice ${invoiceNo}.`,
                        actionType: 'Cek Pembayaran Gateway',
                        targetName: invoiceNo,
                        dbStatus: 'pending',
                        dbTable: 'orders (PENDING)',
                        details: [
                            { label: 'Nomor Invoice', value: invoiceNo },
                            { label: 'Produk & Varian', value: `${data.data?.product_name || '-'} (${data.data?.item_name || '-'})` },
                            { label: 'Total Tagihan', value: `Rp ${Number(data.data?.total_amount || 0).toLocaleString('id-ID')}` },
                            { label: 'Metode Pembayaran', value: data.data?.payment_name || 'QRIS' },
                            { label: 'Status Gateway', value: 'MENUNGGU PEMBAYARAN (Belum Ada Mutasi Masuk)' },
                        ],
                        primaryButton: {
                            text: 'Tandai Lunas Manual',
                            onClick: () => {
                                closeFloatingModal();
                                handleOrderAction('mark_paid', invoiceNo);
                            },
                        },
                        secondaryButton: {
                            text: 'Cek Ulang',
                            onClick: () => handleCheckPayment(invoiceNo),
                        },
                    });
                }
            } else {
                showToast('error', data.message || 'Gagal mengecek status pembayaran');
                openFloatingModal({
                    type: 'error',
                    title: 'Gagal Cek Pembayaran',
                    subtitle: data.message || 'Tidak dapat terhubung ke server payment gateway.',
                    actionType: 'Cek Pembayaran Gateway',
                    targetName: invoiceNo,
                    dbStatus: 'error',
                    dbTable: 'orders',
                    details: [
                        { label: 'Nomor Invoice', value: invoiceNo },
                        { label: 'Penyebab Error', value: data.message || 'Koneksi ke gateway timeout atau bermasalah' },
                    ],
                });
            }
        } catch (e: any) {
            showToast('error', e.message);
            openFloatingModal({
                type: 'error',
                title: 'Kesalahan Sistem',
                subtitle: e.message,
                actionType: 'Cek Pembayaran Gateway',
                targetName: invoiceNo,
                dbStatus: 'error',
                details: [{ label: 'Error Detail', value: e.message }],
            });
        } finally {
            setCheckingPaymentInvoice(null);
        }
    };

    // -------------------------------------------------------------
    // CHECK ALL PENDING PAYMENTS (MASSAL)
    // -------------------------------------------------------------
    const handleCheckAllPayments = async () => {
        const pendingCount = orders.filter(o => o.status === 'PENDING').length;
        if (pendingCount === 0) {
            openFloatingModal({
                type: 'info',
                title: 'Tidak Ada Pesanan Pending',
                subtitle: 'Semua transaksi saat ini sudah berstatus LUNAS atau tidak ada transaksi yang sedang menunggu pembayaran.',
                actionType: 'Cek Semua Pembayaran',
                targetName: 'Semua Pesanan',
                dbStatus: 'synced',
                details: [
                    { label: 'Total Pesanan di Database', value: `${orders.length} pesanan` },
                    { label: 'Pesanan Pending', value: '0 pesanan' },
                    { label: 'Pesanan Lunas', value: `${orders.filter(o => o.status === 'PAID').length} pesanan` },
                ],
            });
            return;
        }

        setBulkCheckingPayment(true);
        try {
            const res = await fetch('/api/admin/orders', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ action: 'check_all_pending' }),
            });
            const data = await res.json();
            if (data.success) {
                await loadAllData();
                showToast('success', data.message);
                openFloatingModal({
                    type: data.newlyPaidCount > 0 ? 'success' : 'payment_not_detected',
                    title: data.newlyPaidCount > 0 ? 'Pembayaran Berhasil Terdeteksi!' : 'Pengecekan Selesai: Masih Belum Ada Pembayaran Masuk',
                    subtitle: data.message,
                    actionType: 'Cek Semua Pembayaran Pending',
                    targetName: `${data.totalChecked} Pesanan Pending`,
                    dbStatus: data.newlyPaidCount > 0 ? 'updated' : 'pending',
                    dbTable: 'orders',
                    bulkDetails: data.details,
                    details: [
                        { label: 'Total Pesanan Diperiksa', value: `${data.totalChecked} pesanan pending` },
                        { label: 'Berhasil Terdeteksi LUNAS', value: `${data.newlyPaidCount} pesanan (Lisensi otomatis terbit & tersimpan di database)` },
                        { label: 'Belum Terdeteksi', value: `${data.stillPendingCount} pesanan (Belum ada mutasi masuk)` },
                        { label: 'Status Database Supabase', value: '✓ Berhasil Disinkronkan ke Cloud' },
                    ],
                });
            } else {
                showToast('error', data.message || 'Gagal mengecek semua pembayaran');
                openFloatingModal({
                    type: 'error',
                    title: 'Gagal Cek Semua Pembayaran',
                    subtitle: data.message || 'Terjadi kesalahan saat memeriksa gateway.',
                    actionType: 'Cek Semua Pembayaran',
                    dbStatus: 'error',
                    details: [{ label: 'Error Detail', value: data.message }],
                });
            }
        } catch (e: any) {
            showToast('error', e.message);
            openFloatingModal({
                type: 'error',
                title: 'Kesalahan Sistem',
                subtitle: e.message,
                actionType: 'Cek Semua Pembayaran',
                dbStatus: 'error',
                details: [{ label: 'Error Detail', value: e.message }],
            });
        } finally {
            setBulkCheckingPayment(false);
        }
    };

    // =============================================================
    // RENDER: LOGIN FORM (IF NOT AUTHENTICATED)
    // =============================================================
    if (!isAuthenticated) {
        return (
            <div className="min-h-[75vh] flex items-center justify-center px-4">
                <div className="w-full max-w-md coda-card p-8 border border-[#1a2a5a] bg-gradient-to-b from-[#101a3b] to-[#060a1c] shadow-2xl relative overflow-hidden">
                    <div className="absolute -top-12 -right-12 w-36 h-36 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

                    <div className="text-center space-y-3 mb-8">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 mx-auto flex items-center justify-center shadow-lg shadow-blue-500/30">
                            <Lock className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-2xl font-black text-white tracking-tight">
                            Panel Pengelola Toko
                        </h1>
                        <p className="text-xs text-gray-400">
                            Masukkan PIN Keamanan untuk mengedit nama web, logo, produk, banner & API Key
                        </p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                                Username Admin
                            </label>
                            <input
                                type="text"
                                value={usernameInput}
                                onChange={(e) => setUsernameInput(e.target.value)}
                                placeholder="Username (default: admin)"
                                className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-gray-500"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                                Password Admin
                            </label>
                            <input
                                type="password"
                                value={passwordInput}
                                onChange={(e) => setPasswordInput(e.target.value)}
                                placeholder="Password (default: admin123)"
                                className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-gray-500"
                                autoFocus
                                required
                            />
                            <p className="text-[11px] text-gray-400 mt-2 text-center">
                                💡 Default Akun: <code className="text-blue-400 font-mono bg-blue-500/10 px-1.5 py-0.5 rounded">admin</code> / <code className="text-blue-400 font-mono bg-blue-500/10 px-1.5 py-0.5 rounded">admin123</code>
                            </p>
                        </div>

                        {authError && (
                            <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span>{authError}</span>
                            </div>
                        )}

                        <Turnstile onToken={setTsToken} />

                        <button
                            type="submit"
                            disabled={authLoading}
                            className="w-full coda-btn py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                        >
                            {authLoading ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    <span>Memeriksa Akun...</span>
                                </>
                            ) : (
                                <>
                                    <Unlock className="w-4 h-4" />
                                    <span>Buka Dashboard Admin</span>
                                </>
                            )}
                        </button>

                        <div className="text-center pt-2">
                            <Link href="/" className="text-xs text-gray-400 hover:text-blue-400 inline-flex items-center gap-1 transition-colors">
                                ← Kembali ke Beranda Toko
                            </Link>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    // Filter orders
    const filteredOrders = orders.filter(ord => {
        const matchesSearch = !orderSearch ||
            ord.invoice_no?.toLowerCase().includes(orderSearch.toLowerCase()) ||
            ord.user_whatsapp?.includes(orderSearch) ||
            ord.user_id_game?.toLowerCase().includes(orderSearch.toLowerCase()) ||
            ord.product_name?.toLowerCase().includes(orderSearch.toLowerCase());

        const matchesStatus = orderFilterStatus === 'ALL' || ord.status === orderFilterStatus;
        return matchesSearch && matchesStatus;
    });

    const totalIncome = orders.filter(o => o.status === 'PAID').reduce((acc, curr) => acc + (curr.total_amount || 0), 0);
    const paidCount = orders.filter(o => o.status === 'PAID').length;

    // =============================================================
    // RENDER: FULL ADMIN DASHBOARD
    // =============================================================
    return (
        <div className="w-full max-w-7xl mx-auto space-y-6 px-1 sm:px-4 pb-12">

            {/* Toast Notification */}
            {toastMessage && (
                <div className={`fixed bottom-6 right-6 z-50 p-4 rounded-xl shadow-2xl border flex items-center gap-3 text-sm font-medium transition-all ${toastMessage.type === 'success'
                    ? 'bg-emerald-950 border-emerald-500/40 text-emerald-200'
                    : 'bg-red-950 border-red-500/40 text-red-200'
                    }`}>
                    {toastMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />}
                    <span>{toastMessage.text}</span>
                </div>
            )}

            {/* Top Bar Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 coda-card p-4 sm:p-6 border border-[#1a2a5a] bg-[#0a1230]">
                <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <Gamepad2 className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-black text-white">
                                {settings?.site_name || 'KENZIxCheat'}
                            </h1>
                            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold border border-blue-500/30 uppercase">
                                Admin Suite
                            </span>
                        </div>
                        <p className="text-xs text-gray-400">
                            Pterodactyl Node + Nginx Mode Active • Kelola Semua Pengaturan Toko
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <Link
                        href="/"
                        target="_blank"
                        className="px-3.5 py-2 rounded-xl bg-blue-950/60 hover:bg-blue-900/60 text-xs font-bold text-blue-200 flex items-center gap-1.5 transition-colors border border-[#1a2a5a]"
                    >
                        <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                        <span>Lihat Toko Live</span>
                    </Link>

                    <button
                        onClick={() => loadAllData(adminToken, true)}
                        disabled={loadingData}
                        className="px-3.5 py-2 rounded-xl bg-[#101a3b] hover:bg-[#1a2a5a] text-xs font-bold text-gray-200 flex items-center gap-1.5 transition-colors border border-[#1a2a5a]"
                        title="Segarkan Data"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
                        <span>Refresh</span>
                    </button>

                    <Link
                        href="/admin/thanhub"
                        className="px-3.5 py-2 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 text-xs font-bold flex items-center gap-1.5 transition-colors border border-yellow-500/30"
                    >
                        <span>🔑 Thanhub</span>
                    </Link>

                    <Link
                        href="/admin/users"
                        className="px-3.5 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-xs font-bold flex items-center gap-1.5 transition-colors border border-blue-500/30"
                    >
                        <span>👥 User &amp; Saldo</span>
                    </Link>

                    <button
                        onClick={handleLogout}
                        className="px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold flex items-center gap-1.5 transition-colors border border-red-500/30"
                    >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Kunci / Logout</span>
                    </button>
                </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="coda-card p-4 border border-[#1a2a5a] bg-[#060a1c]">
                    <span className="text-[11px] text-gray-400 font-semibold uppercase">Total Omset Sukses</span>
                    <p className="text-lg sm:text-xl font-black text-emerald-400 mt-1">
                        Rp {totalIncome.toLocaleString('id-ID')}
                    </p>
                </div>
                <div className="coda-card p-4 border border-[#1a2a5a] bg-[#060a1c]">
                    <span className="text-[11px] text-gray-400 font-semibold uppercase">Transaksi Sukses</span>
                    <p className="text-lg sm:text-xl font-black text-white mt-1">
                        {paidCount} <span className="text-xs text-gray-400 font-normal">/ {orders.length} pesanan</span>
                    </p>
                </div>
                <div className="coda-card p-4 border border-[#1a2a5a] bg-[#060a1c]">
                    <span className="text-[11px] text-gray-400 font-semibold uppercase">Total Produk</span>
                    <p className="text-lg sm:text-xl font-black text-blue-400 mt-1">
                        {products.length} <span className="text-xs text-gray-400 font-normal">Game & Cheat</span>
                    </p>
                </div>
                <div className="coda-card p-4 border border-[#1a2a5a] bg-[#060a1c]">
                    <span className="text-[11px] text-gray-400 font-semibold uppercase">Database Status</span>
                    <div className="flex items-center gap-1.5 mt-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${dbStatus?.connected ? 'bg-emerald-400' : 'bg-blue-400 animate-pulse'}`} />
                        <p className="text-xs font-bold text-white truncate">
                            {dbStatus?.connected ? 'Supabase Cloud' : 'Local File Cache'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Tabs Navigation */}
            <div className="flex border-b border-[#1a2a5a] gap-1 sm:gap-2 overflow-x-auto pb-1 max-w-full">
                <button
                    onClick={() => setActiveTab('settings')}
                    className={`px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm font-bold rounded-t-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${activeTab === 'settings'
                        ? 'bg-[#0a1230] text-blue-300 border-t-2 border-blue-500'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#0a1230]/50'
                        }`}
                >
                    <Settings className="w-4 h-4" />
                    <span>Pengaturan Web & Logo</span>
                </button>

                <button
                    onClick={() => setActiveTab('banners')}
                    className={`px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm font-bold rounded-t-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${activeTab === 'banners'
                        ? 'bg-[#0a1230] text-blue-300 border-t-2 border-blue-500'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#0a1230]/50'
                        }`}
                >
                    <ImageIcon className="w-4 h-4" />
                    <span>Banner Promo ({settings?.banners?.length || 0})</span>
                </button>

                <button
                    onClick={() => setActiveTab('products')}
                    className={`px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm font-bold rounded-t-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${activeTab === 'products'
                        ? 'bg-[#0a1230] text-blue-300 border-t-2 border-blue-500'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#0a1230]/50'
                        }`}
                >
                    <Package className="w-4 h-4" />
                    <span>Katalog Produk & SKU ({products.length})</span>
                </button>

                <button
                    onClick={() => setActiveTab('apikeys')}
                    className={`px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm font-bold rounded-t-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${activeTab === 'apikeys'
                        ? 'bg-[#0a1230] text-blue-300 border-t-2 border-blue-500'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#0a1230]/50'
                        }`}
                >
                    <Key className="w-4 h-4" />
                    <span>API Payment Gateway</span>
                </button>

                <button
                    onClick={() => setActiveTab('orders')}
                    className={`px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm font-bold rounded-t-xl transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${activeTab === 'orders'
                        ? 'bg-[#0a1230] text-blue-300 border-t-2 border-blue-500'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#0a1230]/50'
                        }`}
                >
                    <ListOrdered className="w-4 h-4" />
                    <span>Pesanan & Transaksi ({orders.length})</span>
                </button>
            </div>

            {/* ============================================================= */}
            {/* TAB 1: PENGATURAN SITUS & BRANDING */}
            {/* ============================================================= */}
            {activeTab === 'settings' && settings && (
                <form onSubmit={handleSaveSettings} className="space-y-6">
                    <div className="coda-card p-6 sm:p-8 space-y-6 border border-[#1a2a5a]">
                        <div className="border-b border-[#1a2a5a] pb-4">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Settings className="w-5 h-5 text-blue-400" />
                                <span>Informasi & Branding Toko</span>
                            </h2>
                            <p className="text-xs text-gray-400 mt-1">
                                Perubahan nama web, logo, dan running text akan langsung diterapkan seketika ke seluruh halaman pengunjung.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                                    Nama Web / Toko
                                </label>
                                <input
                                    type="text"
                                    value={settings.site_name}
                                    onChange={(e) => setSettings({ ...settings, site_name: e.target.value })}
                                    placeholder="Contoh: KENZIxCheat"
                                    className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                                    Nomor WhatsApp CS (Untuk Bantuan)
                                </label>
                                <input
                                    type="text"
                                    value={settings.whatsapp_cs}
                                    onChange={(e) => setSettings({ ...settings, whatsapp_cs: e.target.value })}
                                    placeholder="Contoh: 081234567890"
                                    className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                                    Username Telegram CS
                                </label>
                                <input
                                    type="text"
                                    value={settings.telegram_cs || ''}
                                    onChange={(e) => setSettings({ ...settings, telegram_cs: e.target.value })}
                                    placeholder="Contoh: username_telegram"
                                    className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                                    Link Saluran WhatsApp
                                </label>
                                <input
                                    type="url"
                                    value={settings.wa_channel || ''}
                                    onChange={(e) => setSettings({ ...settings, wa_channel: e.target.value })}
                                    placeholder="https://whatsapp.com/channel/..."
                                    className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div className="col-span-1 sm:col-span-2">
                                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                                    Tagline / Slogan Toko
                                </label>
                                <input
                                    type="text"
                                    value={settings.site_tagline || settings.site_title || ''}
                                    onChange={(e) => setSettings({ ...settings, site_title: e.target.value, site_tagline: e.target.value })}
                                    placeholder="Contoh: Pusat Lisensi Cheat VIP & Game Resmi Instan"
                                    className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                                    required
                                />
                            </div>
                        </div>

                        {/* Div Logo Toko di bawah Tagline - Full Bingkai Kanan Kiri */}
                        <div className="w-full block">
                            <ImageFieldEditor
                                label="Logo Toko (Header, Favicon, & Nota)"
                                value={settings.site_logo || ''}
                                onChange={(val) => setSettings({ ...settings, site_logo: val })}
                                placeholder="/images/logo.svg atau URL logo..."
                                description="Format JPG, PNG, WEBP, SVG. Ditampilkan di Navbar, Footer, dan Nota Invoice pelanggan."
                                folder="logos"
                                aspectRatio="square"
                            />
                        </div>

                        {/* Div Barcode QRIS Toko - Full Bingkai Kanan Kiri */}
                        <div className="w-full block">
                            <ImageFieldEditor
                                label="Barcode QRIS Toko (Pembayaran & Backup)"
                                value={settings.qris_image || ''}
                                onChange={(val) => setSettings({ ...settings, qris_image: val })}
                                placeholder="URL gambar barcode QRIS (opsional)..."
                                description="Gambar barcode QRIS untuk metode pembayaran instan maupun backup saat gateway maintenance."
                                folder="qris"
                                aspectRatio="square"
                            />
                        </div>

                        {/* Running Text Notification */}
                        <div className="p-4 rounded-xl bg-[#060a1c] border border-[#1a2a5a] space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                                    Running Text / Pengumuman Promo Pita Atas
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={settings.announcement_active}
                                        onChange={(e) => setSettings({ ...settings, announcement_active: e.target.checked })}
                                        className="w-4 h-4 text-blue-500 rounded bg-[#0b1329] border-slate-700"
                                    />
                                    <span className="text-xs text-gray-400">Tampilkan Pengumuman</span>
                                </label>
                            </div>
                            <input
                                type="text"
                                value={settings.announcement}
                                onChange={(e) => setSettings({ ...settings, announcement: e.target.value })}
                                placeholder="Teks pengumuman yang berjalan di atas navbar..."
                                className="w-full bg-[#0b1329] border border-[#1e2b48] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        {/* Google Gmail SMTP Configuration */}
                        <div className="p-5 rounded-xl bg-blue-950/20 border border-blue-500/30 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Mail className="w-5 h-5 text-blue-400" />
                                    <div>
                                        <h3 className="text-sm font-bold text-blue-300 uppercase tracking-wider">
                                            Pengiriman Email Otomatis (Google Gmail SMTP)
                                        </h3>
                                        <p className="text-xs text-gray-400">
                                            Email digunakan khusus untuk mengirim invoice dan lisensi cheat VIP pembeli secara otomatis.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-300 mb-1">Email Pengirim (Gmail Anda)</label>
                                    <input
                                        type="email"
                                        value={settings.smtp_user || ''}
                                        onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })}
                                        placeholder="namaakun@gmail.com"
                                        className="w-full bg-[#090e1a] border border-blue-500/30 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-300 mb-1">Google App Password (16 Karakter)</label>
                                    <input
                                        type="password"
                                        value={settings.smtp_pass || ''}
                                        onChange={(e) => setSettings({ ...settings, smtp_pass: e.target.value })}
                                        placeholder="Contoh: abcd efgh ijkl mnop"
                                        className="w-full bg-[#090e1a] border border-blue-500/30 rounded-xl px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-300 mb-1">Nama Pengirim (Display Name)</label>
                                    <input
                                        type="text"
                                        value={settings.smtp_from || ''}
                                        onChange={(e) => setSettings({ ...settings, smtp_from: e.target.value })}
                                        placeholder="KENZIxCheat"
                                        className="w-full bg-[#090e1a] border border-blue-500/30 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="col-span-2">
                                        <label className="block text-xs text-gray-300 mb-1">SMTP Host</label>
                                        <input
                                            type="text"
                                            value={settings.smtp_host || 'smtp.gmail.com'}
                                            onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
                                            placeholder="smtp.gmail.com"
                                            className="w-full bg-[#090e1a] border border-blue-500/30 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-300 mb-1 text-center">Port</label>
                                        <input
                                            type="number"
                                            value={settings.smtp_port || 465}
                                            onChange={(e) => setSettings({ ...settings, smtp_port: Number(e.target.value) })}
                                            placeholder="465"
                                            className="w-full bg-[#090e1a] border border-blue-500/30 rounded-xl px-2 py-2 text-white text-sm focus:outline-none focus:border-blue-500 text-center font-mono"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                                <p className="text-[11px] text-blue-300/80 bg-blue-900/20 p-2.5 rounded-lg border border-blue-500/20 flex-1">
                                    💡 <strong>Tips Gmail:</strong> Buka <em>Akun Google &gt; Keamanan &gt; Verifikasi 2 Langkah &gt; Sandi Aplikasi</em> untuk membuat password 16 karakter tanpa password akun utama.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleTestEmail}
                                    disabled={testEmailLoading}
                                    className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shrink-0 shadow-lg shadow-blue-900/30 disabled:opacity-50 cursor-pointer"
                                >
                                    {testEmailLoading ? (
                                        <>
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                            <span>Menghubungkan...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-3.5 h-3.5" />
                                            <span>Tes Koneksi & Kirim Email</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Akun admin: diganti lewat endpoint khusus (hash + konfirmasi password), bukan lewat pengaturan web */}
                        <AdminAccountCard />

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={saveLoading}
                                className="coda-btn px-6 py-2.5 text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20"
                            >
                                <Save className="w-4 h-4" />
                                <span>{saveLoading ? 'Menyimpan...' : 'Simpan Pengaturan Web'}</span>
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {/* ============================================================= */}
            {/* TAB 2: MANAJEMEN BANNER PROMO */}
            {/* ============================================================= */}
            {activeTab === 'banners' && settings && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <ImageIcon className="w-5 h-5 text-blue-400" />
                                <span>Manajemen Banner Promo Carousel</span>
                            </h2>
                            <p className="text-xs text-gray-400 mt-1">
                                Banner hero slider yang tampil otomatis di bagian paling atas halaman Beranda.
                            </p>
                        </div>
                        <button
                            onClick={openAddBannerModal}
                            className="coda-btn px-4 py-2 text-xs font-bold flex items-center gap-1.5"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Tambah Banner</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(settings.banners || []).map((b, idx) => (
                            <div key={b.id || idx} className="coda-card rounded-2xl overflow-hidden border border-[#1a2a5a] bg-[#060a1c] flex flex-col justify-between group">
                                <div className="relative h-40 w-full overflow-hidden bg-blue-950">
                                    <img src={b.image} alt={b.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#060a1c] via-transparent to-transparent" />
                                    <span className="absolute top-3 left-3 text-[10px] font-black tracking-wider uppercase px-2.5 py-1 rounded-full bg-black/60 text-blue-300 border border-blue-500/30">
                                        {b.badge}
                                    </span>
                                </div>

                                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                                    <div>
                                        <h3 className="text-sm font-black text-white line-clamp-1">{b.title}</h3>
                                        <p className="text-xs text-gray-400 line-clamp-2 mt-1">{b.subtitle}</p>
                                    </div>

                                    <div className="pt-2 border-t border-[#1a2a5a] flex items-center justify-between text-xs">
                                        <span className="text-gray-400 text-[11px] font-mono">/{b.slug}</span>
                                        <div className="flex items-center gap-1.5">
                                            <a
                                                href={`/topup/${b.slug}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-1.5 rounded-lg bg-blue-950/50 hover:bg-blue-900/50 text-blue-300 transition-colors"
                                                title="Buka Halaman Produk"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                            <button
                                                onClick={() => openEditBannerModal(b)}
                                                className="p-1.5 rounded-lg bg-blue-950/50 hover:bg-blue-900/50 text-gray-300 transition-colors"
                                                title="Edit Banner"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteBanner(b.id)}
                                                className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                                                title="Hapus Banner"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ============================================================= */}
            {/* TAB 3: KATALOG PRODUK & SKU */}
            {/* ============================================================= */}
            {activeTab === 'products' && (
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Package className="w-5 h-5 text-blue-400" />
                                <span>Katalog Produk & Varian</span>
                            </h2>
                            <p className="text-xs text-gray-400 mt-1">
                                Tambah & edit produk serta varian secara manual. Kolom SKU varian = ID varian Thanhub.
                            </p>
                        </div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <button
                                onClick={openBulkPricingModal}
                                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600/25 to-teal-600/25 hover:from-emerald-600/40 hover:to-teal-600/40 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-950/40"
                                title="Atur keuntungan atau markup harga sekaligus (Rp atau %) untuk semua atau produk terpilih"
                            >
                                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                                <span>⚡ Atur Keuntungan Massal</span>
                            </button>
                            <button
                                onClick={openCreateProductModal}
                                className="coda-btn px-4 py-2 text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Tambah Produk Baru</span>
                            </button>
                        </div>
                    </div>

                    {/* Thanhub status */}
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-[#060a1c] to-indigo-950/40 border border-blue-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                                <Sparkles className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-black text-white uppercase tracking-wider">Thanhub</span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${thBalance !== null ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-gray-500/20 text-gray-300 border-gray-500/30'}`}>
                                        {thBalance !== null ? 'TERHUBUNG' : 'BELUM TERHUBUNG'}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    Key dikirim otomatis dari Thanhub setelah bayar. Produk & harga diatur manual di sini.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 bg-[#060a1c] px-4 py-2 rounded-xl border border-[#1a2a5a]">
                            <div>
                                <span className="text-[10px] text-gray-400 block font-medium">Saldo Thanhub:</span>
                                <span className="text-sm font-black text-emerald-400 font-mono">
                                    {thBalance !== null ? 'Rp ' + thBalance.toLocaleString('id-ID') : '-'}
                                </span>
                            </div>
                            <div className="text-right pl-3 border-l border-[#1a2a5a]">
                                <a href="/admin/thanhub" className="text-[11px] font-bold text-blue-400 hover:text-blue-300">Atur koneksi →</a>
                            </div>
                        </div>
                    </div>

                    {/* Filter Visibilitas & Search Bar */}
                    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#060a1c] p-3 rounded-2xl border border-[#1a2a5a]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                                type="button"
                                onClick={() => setProductFilter('all')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${productFilter === 'all'
                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                                    : 'bg-[#0a1230] text-gray-400 hover:text-white border border-[#1a2a5a]'
                                    }`}
                            >
                                <span>Semua Produk</span>
                                <span className="px-1.5 py-0.5 rounded-full bg-blue-950/80 text-[10px]">{products.length}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setProductFilter('public')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${productFilter === 'public'
                                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                                    : 'bg-[#0a1230] text-emerald-400 hover:text-emerald-300 border border-emerald-500/20'
                                    }`}
                            >
                                <Eye className="w-3 h-3" />
                                <span>🟢 Publik ({products.filter((p) => p.is_active).length})</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setProductFilter('private')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${productFilter === 'private'
                                    ? 'bg-amber-600 text-white shadow-md shadow-amber-900/40'
                                    : 'bg-[#0a1230] text-amber-400 hover:text-amber-300 border border-amber-500/20'
                                    }`}
                            >
                                <Lock className="w-3 h-3" />
                                <span>🔒 Private ({products.filter((p) => !p.is_active).length})</span>
                            </button>
                        </div>

                        <div className="relative flex-1 max-w-md">
                            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                placeholder="Cari nama produk, slug, atau kategori..."
                                className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                            />
                            {productSearch && (
                                <button
                                    onClick={() => setProductSearch('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Quick Info Box */}
                    <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-500/20 text-xs text-blue-300/80 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                        <span>
                            <strong>Manual:</strong> tidak ada sinkron produk otomatis. Klik <strong>Tambah Produk Baru</strong>, lalu tambahkan varian (SKU = ID varian Thanhub, mis. <code>123</code> atau <code>thb:123</code>) beserta harga jual dan stoknya.
                        </span>
                    </div>

                    {/* Grid Produk */}
                    {(() => {
                        const filtered = products.filter((prod) => {
                            if (productFilter === 'public' && !prod.is_active) return false;
                            if (productFilter === 'private' && prod.is_active) return false;
                            if (productSearch.trim()) {
                                const q = productSearch.toLowerCase();
                                const matchName = (prod.name || '').toLowerCase().includes(q);
                                const matchSlug = (prod.slug || '').toLowerCase().includes(q);
                                const matchPub = (prod.publisher || '').toLowerCase().includes(q);
                                const matchBadge = (prod.badge || '').toLowerCase().includes(q);
                                if (!matchName && !matchSlug && !matchPub && !matchBadge) return false;
                            }
                            return true;
                        });

                        if (filtered.length === 0) {
                            return (
                                <div className="coda-card p-10 rounded-2xl border border-[#1a2a5a] bg-[#060a1c] text-center space-y-3">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 mx-auto flex items-center justify-center text-blue-400">
                                        <Package className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-sm font-bold text-white">Tidak ada produk ditemukan</h3>
                                    <p className="text-xs text-gray-400 max-w-sm mx-auto">
                                        {productSearch
                                            ? `Tidak ada produk yang cocok dengan pencarian "${productSearch}".`
                                            : productFilter === 'private'
                                                ? 'Tidak ada produk dengan status Private saat ini. Semua produk berstatus Publik.'
                                                : 'Tidak ada produk dengan status Publik saat ini.'}
                                    </p>
                                </div>
                            );
                        }

                        return (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {filtered.map((prod) => (
                                    <div
                                        key={prod.slug}
                                        className={`coda-card p-5 rounded-2xl border flex flex-col justify-between space-y-4 transition-all ${prod.is_active
                                            ? 'border-[#1a2a5a] bg-[#060a1c]'
                                            : 'border-amber-500/40 bg-[#0a1230]'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3.5">
                                            <img
                                                src={prod.icon_url}
                                                alt={prod.name}
                                                className="w-14 h-14 rounded-2xl object-cover border border-[#1a2a5a] flex-shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="text-base font-black text-white truncate">{prod.name}</h3>
                                                    {prod.is_active ? (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 flex items-center gap-1 shadow-sm shadow-emerald-950">
                                                            <Eye className="w-3 h-3" />
                                                            PUBLIK
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30 flex items-center gap-1 shadow-sm shadow-amber-950">
                                                            <Lock className="w-3 h-3" />
                                                            PRIVATE (DRAFT)
                                                        </span>
                                                    )}
                                                    {prod.maintenance && (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-bold border border-orange-500/40 flex items-center gap-1">
                                                            🛠️ MAINTENANCE
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                                                        {prod.badge || 'PROMO'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-400 mt-0.5">{prod.publisher} • /{prod.slug}</p>
                                                <p className="text-xs text-gray-400 line-clamp-2 mt-2 leading-relaxed">{prod.description}</p>
                                            </div>
                                        </div>

                                        <div className="pt-3 border-t border-[#1a2a5a] flex items-center justify-between flex-wrap gap-2 text-xs">
                                            <div className="text-gray-400">
                                                <span className="font-bold text-white">{prod.items?.length || 0}</span> Item Nominal
                                            </div>

                                            <div className="flex items-center gap-2 flex-wrap">
                                                {/* Tombol Cepat Toggle Publik / Private */}
                                                <button
                                                    onClick={() => handleToggleProductVisibility(prod)}
                                                    disabled={visibilityTogglingSlug === prod.slug}
                                                    className={`px-2.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all text-xs border ${prod.is_active
                                                        ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
                                                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                                        } disabled:opacity-50`}
                                                    title={prod.is_active ? 'Sembunyikan produk dari website publik' : 'Tampilkan produk ke website publik agar bisa dibeli pelanggan'}
                                                >
                                                    {visibilityTogglingSlug === prod.slug ? (
                                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                    ) : prod.is_active ? (
                                                        <Lock className="w-3.5 h-3.5" />
                                                    ) : (
                                                        <Eye className="w-3.5 h-3.5" />
                                                    )}
                                                    <span>{prod.is_active ? 'Jadikan Private' : 'Tampilkan Publik'}</span>
                                                </button>

                                                <button
                                                    onClick={() => openSkuManager(prod)}
                                                    className="px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-bold flex items-center gap-1 transition-colors border border-blue-500/30"
                                                >
                                                    <Layers className="w-3.5 h-3.5" />
                                                    <span>Kelola SKU</span>
                                                </button>
                                                <button
                                                    onClick={() => openEditProductModal(prod)}
                                                    className="p-1.5 rounded-lg bg-blue-950/50 hover:bg-blue-900/50 text-gray-200 transition-colors"
                                                    title="Edit Produk"
                                                >
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteProduct(prod.slug, prod.name)}
                                                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                                                    title="Hapus Produk"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* ============================================================= */}
            {/* TAB 4: API KEYS & GATEWAY INTEGRATION */}
            {/* ============================================================= */}
            {activeTab === 'apikeys' && settings && (
                <form onSubmit={handleSaveSettings} className="space-y-6">
                    <div className="coda-card p-6 sm:p-8 space-y-6 border border-[#1a2a5a]">
                        <div className="border-b border-[#1a2a5a] pb-4">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Key className="w-5 h-5 text-blue-400" />
                                <span>Pengaturan Integrasi API Gateway</span>
                            </h2>
                            <p className="text-xs text-gray-400 mt-1">
                                Kelola API Key Payment Gateway (AutoGopay / Wijayapay) untuk pembayaran QRIS & Crypto Koneksi Thanhub (pengiriman key otomatis) diatur di halaman Thanhub.
                            </p>
                        </div>

                        {/* Card Pemilihan Provider Payment Gateway */}
                        <div className="p-5 rounded-2xl bg-[#060a1c] border border-[#1a2a5a] space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-300">
                                        <CreditCard className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-white">Payment Gateway Aktif</h3>
                                        <p className="text-xs text-gray-400">Pilih provider pemrosesan transaksi QRIS & Crypto untuk toko Anda</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    
                                    <button
                                        type="button"
                                        onClick={() => setSettings({ ...settings, payment_gateway_provider: 'wijayapay' })}
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${settings.payment_gateway_provider === 'wijayapay'
                                                ? 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-600/30'
                                                : 'bg-black/40 text-gray-400 border-blue-900/40 hover:text-white'
                                            }`}
                                    >
                                        WijayaPay (Legacy)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSettings({ ...settings, payment_gateway_provider: 'autogopay' })}
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${settings.payment_gateway_provider === 'autogopay'
                                                ? 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-600/30'
                                                : 'bg-black/40 text-gray-400 border-blue-900/40 hover:text-white'
                                            }`}
                                    >
                                        AutoGopay (QRIS GoPay)
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Card AutoGopay PG (QRIS dinamis GoPay Merchant) */}
                        <div className={`p-5 rounded-2xl bg-[#060a1c] border transition-all space-y-4 ${settings.payment_gateway_provider === 'autogopay'
                                ? 'border-blue-500/60 ring-1 ring-blue-500/30 shadow-lg shadow-blue-950/40'
                                : 'border-[#1a2a5a] opacity-75'
                            }`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                                        <CreditCard className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-bold text-white">AutoGopay Payment Gateway</h3>
                                            {settings.payment_gateway_provider === 'autogopay' && (
                                                <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded font-mono font-bold">
                                                    SEDANG AKTIF
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-400">QRIS dinamis GoPay Merchant • Webhook + cek status otomatis</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                <div>
                                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                                        API Key AutoGopay (Header X-API-Key)
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showKeyAutogopay ? 'text' : 'password'}
                                            value={settings.autogopay_api_key || ''}
                                            onChange={(e) => setSettings({ ...settings, autogopay_api_key: e.target.value })}
                                            placeholder="iak_xxxxxx"
                                            autoComplete="off"
                                            className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-xl px-4 py-2 pr-10 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowKeyAutogopay(!showKeyAutogopay)}
                                            className="absolute right-3 top-2 text-gray-400 hover:text-white"
                                        >
                                            {showKeyAutogopay ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1">API Key dan Webhook Secret adalah DUA kredensial terpisah — jangan tertukar.</p>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                                        Webhook Secret AutoGopay
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showSecretAutogopay ? 'text' : 'password'}
                                            value={settings.autogopay_webhook_secret || ''}
                                            onChange={(e) => setSettings({ ...settings, autogopay_webhook_secret: e.target.value })}
                                            placeholder="Webhook secret dari dashboard AutoGopay"
                                            autoComplete="off"
                                            className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-xl px-4 py-2 pr-10 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowSecretAutogopay(!showSecretAutogopay)}
                                            className="absolute right-3 top-2 text-gray-400 hover:text-white"
                                        >
                                            {showSecretAutogopay ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1">Dipakai untuk verifikasi signature webhook (HMAC-SHA256).</p>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                                        Base URL AutoGopay
                                    </label>
                                    <input
                                        type="url"
                                        value={settings.autogopay_base_url || 'https://autogopay.net'}
                                        onChange={(e) => setSettings({ ...settings, autogopay_base_url: e.target.value })}
                                        placeholder="https://autogopay.net"
                                        className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-xl px-4 py-2 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1">Tanpa /api/v1 di belakangnya (kalau terlanjur diisi, otomatis dibuang).</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <button
                                    type="button"
                                    disabled={autogopayTest.loading}
                                    onClick={async () => {
                                        setAutogopayTest({ loading: true });
                                        try {
                                            const res = await fetch('/api/admin/settings/autogopay-test', {
                                                method: 'POST',
                                                headers: authHeaders(),
                                                body: JSON.stringify({
                                                    // nilai bertopeng (••••xxxx) bukan key asli — kirim kosong
                                                    // supaya server memakai key yang sudah tersimpan
                                                    apiKey: (settings.autogopay_api_key || '').startsWith('••••') ? '' : (settings.autogopay_api_key || ''),
                                                    baseUrl: settings.autogopay_base_url || '',
                                                }),
                                            });
                                            const data = await res.json();
                                            setAutogopayTest({ loading: false, ok: !!data.success, message: data.message });
                                        } catch (e: any) {
                                            setAutogopayTest({ loading: false, ok: false, message: e.message || 'Test koneksi gagal' });
                                        }
                                    }}
                                    className="w-full py-2 rounded-xl text-xs font-bold text-gray-300 border border-blue-900/50 bg-black/30 hover:bg-blue-900/20 transition-all disabled:opacity-60"
                                >
                                    {autogopayTest.loading ? 'Menguji koneksi...' : 'Test Koneksi AutoGopay'}
                                </button>
                                {autogopayTest.message && (
                                    <div className={`text-[11px] p-2.5 rounded-lg border ${autogopayTest.ok ? 'bg-green-500/10 text-green-300 border-green-500/30' : 'bg-red-500/10 text-red-300 border-red-500/30'}`}>
                                        {autogopayTest.ok ? '✓ ' : '✗ '}{autogopayTest.message}
                                    </div>
                                )}
                            </div>

                            {/* Webhook Info for AutoGopay */}
                            <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-900/50 text-xs text-blue-200/80 space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="font-semibold text-gray-200">Webhook URL untuk didaftarkan di dashboard AutoGopay:</p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(`${window.location.origin}/api/webhook/autogopay`);
                                            showToast('success', 'Webhook URL AutoGopay berhasil disalin!');
                                        }}
                                        className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded font-bold transition-all flex items-center gap-1"
                                    >
                                        <Copy className="w-3 h-3" />
                                        <span>Salin URL</span>
                                    </button>
                                </div>
                                <code className="text-blue-300 font-mono text-[11px] block bg-black/50 p-2.5 rounded-lg select-all border border-blue-900/40">
                                    {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/autogopay
                                </code>
                                <div className="text-[10px] text-gray-400 space-y-1">
                                    <p>• Signature webhook diverifikasi dengan HMAC-SHA256 memakai Webhook Secret di atas — wajib diisi supaya webhook diterima.</p>
                                    <p>• Cadangan: status juga dicek otomatis lewat API selama pembeli masih membuka halaman bayar.</p>
                                </div>
                            </div>
                        </div>

                        {/* Card Wijayapay PG */}
                        <div className={`p-5 rounded-2xl bg-[#060a1c] border transition-all space-y-4 ${settings.payment_gateway_provider === 'wijayapay'
                                ? 'border-blue-500/60 ring-1 ring-blue-500/30'
                                : 'border-[#1a2a5a] opacity-75'
                            }`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                                        <CreditCard className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-bold text-white">Wijayapay Payment Gateway</h3>
                                            {settings.payment_gateway_provider === 'wijayapay' && (
                                                <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded font-mono font-bold">
                                                    SEDANG AKTIF
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-400">QRIS Dinamis, Virtual Account Bank & Ritel Alfamart/Indomaret</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                <div>
                                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                                        Merchant Code
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.wijayapay_merchant_code || ''}
                                        onChange={(e) => setSettings({ ...settings, wijayapay_merchant_code: e.target.value })}
                                        placeholder="Contoh: WP692f1c7bafd86"
                                        className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-xl px-4 py-2 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                                        API Key Wijayapay
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showKeyWijaya ? 'text' : 'password'}
                                            value={settings.wijayapay_api_key || ''}
                                            onChange={(e) => setSettings({ ...settings, wijayapay_api_key: e.target.value })}
                                            placeholder="x2g0gzxxzztw6whpogbeluuhjbotpv"
                                            className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-xl px-4 py-2 pr-10 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowKeyWijaya(!showKeyWijaya)}
                                            className="absolute right-3 top-2 text-gray-400 hover:text-white"
                                        >
                                            {showKeyWijaya ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                                        Base URL Gateway
                                    </label>
                                    <input
                                        type="url"
                                        value={settings.wijayapay_base_url || 'https://gateway.wijayapay.com'}
                                        onChange={(e) => setSettings({ ...settings, wijayapay_base_url: e.target.value })}
                                        placeholder="https://gateway.wijayapay.com"
                                        className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-xl px-4 py-2 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>

                            {/* Proxy Whitelist IP Configuration */}
                            <div className="p-4 rounded-xl bg-[#0a1230]/90 border border-[#1d3a8d] space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
                                        <span className="text-xs font-bold text-white uppercase tracking-wider">Dedicated Static Proxy (IP Whitelist 103.253.244.66)</span>
                                    </div>
                                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono font-bold">
                                        AKTIF
                                    </span>
                                </div>
                                <p className="text-[11px] text-gray-300">
                                    Mengalihkan seluruh komunikasi API WijayaPay melalui proxy IP statis <code className="text-blue-300 font-mono font-bold">103.253.244.66</code> agar lolos verifikasi IP Whitelist saat dijalankan di Vercel/Cloud Server.
                                </p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1 text-xs">
                                    <div>
                                        <label className="block text-[10px] text-gray-400 mb-1">Host Proxy</label>
                                        <input
                                            type="text"
                                            value={settings.wijayapay_proxy_host || ''}
                                            onChange={(e) => setSettings({ ...settings, wijayapay_proxy_host: e.target.value })}
                                            className="w-full bg-black/40 border border-[#1a2a5a] rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-400 mb-1">Port</label>
                                        <input
                                            type="number"
                                            value={settings.wijayapay_proxy_port || 3128}
                                            onChange={(e) => setSettings({ ...settings, wijayapay_proxy_port: Number(e.target.value) })}
                                            className="w-full bg-black/40 border border-[#1a2a5a] rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-400 mb-1">Username</label>
                                        <input
                                            type="text"
                                            value={settings.wijayapay_proxy_user || ''}
                                            onChange={(e) => setSettings({ ...settings, wijayapay_proxy_user: e.target.value })}
                                            className="w-full bg-black/40 border border-[#1a2a5a] rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-400 mb-1">Password</label>
                                        <input
                                            type="password"
                                            value={settings.wijayapay_proxy_pass || ''}
                                            onChange={(e) => setSettings({ ...settings, wijayapay_proxy_pass: e.target.value })}
                                            className="w-full bg-black/40 border border-[#1a2a5a] rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-900/50 text-xs text-blue-200/80 space-y-1">
                                <p className="font-semibold text-gray-200">Webhook URL untuk didaftarkan di Merchant Dashboard Wijayapay:</p>
                                <code className="text-blue-300 font-mono text-[11px] block bg-black/40 p-2 rounded select-all">
                                    https://kenzixxiter.my.id/api/webhook/wijayapay
                                </code>
                                <p className="text-[10px] text-gray-400">Atau alternatif jika menggunakan domain Vercel: <span className="font-mono text-blue-300">/api/webhook/wijayapay</span></p>
                            </div>
                        </div>

                        {/* Card Supabase Keys */}
                        <div className="p-5 rounded-2xl bg-[#060a1c] border border-[#1a2a5a] space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                                    <Database className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white">Database Supabase (PostgreSQL Cloud)</h3>
                                    <p className="text-xs text-gray-400">
                                        {dbStatus?.connected ? '✓ Terhubung dengan Supabase Cloud (Produk, Stok & Orders Aktif)' : '⚡ Menghubungkan ke Supabase Cloud...'}
                                    </p>
                                </div>
                            </div>

                            <div className="text-xs text-gray-300 leading-relaxed rounded-xl border border-blue-500/30 bg-blue-950/20 p-3">
                                🔒 Kredensial database <b>tidak lagi disimpan/diubah dari web</b> demi keamanan. Atur <code className="font-mono">SUPABASE_URL</code> dan <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> di Vercel → Settings → Environment Variables, lalu redeploy.
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={saveLoading}
                                className="coda-btn px-6 py-2.5 text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20"
                            >
                                <Save className="w-4 h-4" />
                                <span>{saveLoading ? 'Menyimpan...' : 'Simpan Semua API Keys'}</span>
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {/* ============================================================= */}
            {/* TAB 5: RIWAYAT PESANAN & TRANSAKSI */}
            {/* ============================================================= */}
            {activeTab === 'orders' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <ListOrdered className="w-5 h-5 text-blue-400" />
                                <span>Daftar Pesanan & Status Pembayaran</span>
                            </h2>
                            <p className="text-xs text-gray-400 mt-1">
                                Pantau semua transaksi pesanan lisensi secara real-time.
                            </p>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                type="button"
                                onClick={handleCheckAllPayments}
                                disabled={bulkCheckingPayment}
                                className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center gap-1.5 disabled:opacity-50"
                                title="Cek semua pesanan berstatus PENDING ke Payment Gateway Wijayapay"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${bulkCheckingPayment ? 'animate-spin' : ''}`} />
                                <span>{bulkCheckingPayment ? 'Memeriksa Gateway...' : '⚡ Cek Semua Pembayaran'}</span>
                            </button>

                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                                <input
                                    type="text"
                                    value={orderSearch}
                                    onChange={(e) => setOrderSearch(e.target.value)}
                                    placeholder="Cari Invoice / Email / ID..."
                                    className="bg-[#060a1c] border border-[#1a2a5a] rounded-xl pl-9 pr-4 py-2 text-white text-xs focus:outline-none focus:border-blue-500 w-48 sm:w-60"
                                />
                            </div>

                            <select
                                value={orderFilterStatus}
                                onChange={(e) => setOrderFilterStatus(e.target.value)}
                                className="bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                            >
                                <option value="ALL">Semua Status</option>
                                <option value="PAID">LUNAS (PAID)</option>
                                <option value="PENDING">MENUNGGU (PENDING)</option>
                                <option value="EXPIRED">KEDALUWARSA</option>
                                <option value="FAILED">GAGAL</option>
                            </select>
                        </div>
                    </div>

                    <div className="coda-card rounded-2xl overflow-hidden border border-[#1a2a5a] bg-[#060a1c]">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs text-gray-300">
                                <thead className="bg-[#101a3b] text-gray-400 font-bold uppercase tracking-wider border-b border-[#1a2a5a]">
                                    <tr>
                                        <th className="px-4 py-3.5">Invoice & Waktu</th>
                                        <th className="px-4 py-3.5">Produk & Item</th>
                                        <th className="px-4 py-3.5">Target ID & Email</th>
                                        <th className="px-4 py-3.5">Total & Metode</th>
                                        <th className="px-4 py-3.5">Status</th>
                                        <th className="px-4 py-3.5">Lisensi Key</th>
                                        <th className="px-4 py-3.5 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y border-[#1a2a5a] divide-[#1a2a5a]">
                                    {filteredOrders.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                                                Tidak ada transaksi yang cocok.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredOrders.map((ord) => (
                                            <tr key={ord.ref_id} className="hover:bg-[#101a3b]/40 transition-colors">
                                                <td className="px-4 py-3.5 whitespace-nowrap">
                                                    <Link href={`/order/${ord.invoice_no}`} className="font-bold text-white hover:text-blue-400 flex items-center gap-1">
                                                        <span>{ord.invoice_no}</span>
                                                        <ExternalLink className="w-3 h-3 text-gray-400" />
                                                    </Link>
                                                    <span className="text-[10px] text-gray-400 block mt-0.5">
                                                        {new Date(ord.created_at).toLocaleString('id-ID')}
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3.5">
                                                    <span className="font-bold text-white block">{ord.product_name}</span>
                                                    <span className="text-blue-400 text-[11px] block">{ord.item_name}</span>
                                                </td>

                                                <td className="px-4 py-3.5 whitespace-nowrap">
                                                    <span className="text-white font-mono block">ID: {ord.user_id_game}</span>
                                                    <span className="text-gray-400 text-[11px] block">{ord.customer_email || ord.user_whatsapp}</span>
                                                </td>

                                                <td className="px-4 py-3.5 whitespace-nowrap">
                                                    <span className="font-black text-white block">
                                                        Rp {ord.total_amount?.toLocaleString('id-ID')}
                                                    </span>
                                                    <span className="text-gray-400 text-[11px] block">{ord.payment_name}</span>
                                                </td>

                                                <td className="px-4 py-3.5 whitespace-nowrap">
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase border ${ord.status === 'PAID'
                                                        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                                                        : ord.status === 'PENDING'
                                                            ? 'bg-amber-950/60 border-amber-500/40 text-amber-400 animate-pulse'
                                                            : 'bg-red-950/60 border-red-500/40 text-red-400'
                                                        }`}>
                                                        {ord.status}
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3.5">
                                                    {ord.delivery_data?.license_key ? (
                                                        <code className="text-[11px] font-mono bg-[#0a1230] border border-[#1a2a5a] px-2 py-1 rounded text-emerald-400 block truncate max-w-[140px]">
                                                            {ord.delivery_data.license_key}
                                                        </code>
                                                    ) : (
                                                        <span className="text-gray-400 text-[11px]">-</span>
                                                    )}
                                                </td>

                                                <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {ord.status !== 'PAID' && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCheckPayment(ord.invoice_no)}
                                                                    disabled={checkingPaymentInvoice === ord.invoice_no}
                                                                    className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[11px] font-bold border border-blue-500/30 flex items-center gap-1 disabled:opacity-50"
                                                                    title="Cek Mutasi & Status ke Payment Gateway Wijayapay"
                                                                >
                                                                    <RefreshCw className={`w-3 h-3 ${checkingPaymentInvoice === ord.invoice_no ? 'animate-spin' : ''}`} />
                                                                    <span>{checkingPaymentInvoice === ord.invoice_no ? 'Mengecek...' : 'Cek Bayar'}</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOrderAction('mark_paid', ord.invoice_no)}
                                                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-bold border border-emerald-500/30"
                                                                    title="Tandai Sudah Bayar Manual"
                                                                >
                                                                    Set Lunas
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOrderAction('regen_license', ord.invoice_no)}
                                                            className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400"
                                                            title="Generate Ulang Lisensi"
                                                        >
                                                            <Key className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOrderAction('delete', ord.invoice_no)}
                                                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400"
                                                            title="Hapus Order"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================= */}
            {/* MODAL: TAMBAH / EDIT PRODUK */}
            {/* ============================================================= */}
            {isProductModalOpen && editingProduct && (
                <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
                    <div className="w-full max-w-xl bg-[#0a1230] border border-[#1a2a5a] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] my-auto overflow-hidden">
                        {/* Header Modal */}
                        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#1a2a5a] bg-[#08102a] shrink-0">
                            <h3 className="text-base font-black text-white">
                                {editingProduct.id ? 'Edit Produk Game' : 'Tambah Game / Produk Baru'}
                            </h3>
                            <button
                                onClick={() => setIsProductModalOpen(false)}
                                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Scrollable Form Body */}
                        <form onSubmit={handleSaveProduct} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                            <div className="p-5 sm:p-6 overflow-y-auto modal-scrollable space-y-4 flex-1">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-bold text-gray-300 mb-1">Nama Produk</label>
                                        <input
                                            type="text"
                                            value={editingProduct.name || ''}
                                            onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                                            placeholder="Contoh: Free Fire Max, Cheat Epep VIP"
                                            className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-300 mb-1">Slug URL</label>
                                        <input
                                            type="text"
                                            value={editingProduct.slug || ''}
                                            onChange={(e) => setEditingProduct({ ...editingProduct, slug: e.target.value })}
                                            placeholder="free-fire, cheat"
                                            className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-300 mb-1">Publisher</label>
                                        <input
                                            type="text"
                                            value={editingProduct.publisher || ''}
                                            onChange={(e) => setEditingProduct({ ...editingProduct, publisher: e.target.value })}
                                            placeholder="Garena, Moonton, VIP Engine"
                                            className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                                            required
                                        />
                                    </div>

                                    <div className="sm:col-span-2">
                                        <ImageFieldEditor
                                            label="Icon Logo Game (Tampilan Grid & Card)"
                                            value={editingProduct.icon_url || ''}
                                            onChange={(val) => setEditingProduct({ ...editingProduct, icon_url: val })}
                                            placeholder="https://... atau /images/..."
                                            description="Ikon produk utama (1:1). Mendukung input link URL dan upload file dari galeri."
                                            folder="products"
                                            aspectRatio="square"
                                            required
                                        />
                                    </div>

                                    <div className="sm:col-span-2">
                                        <ImageFieldEditor
                                            label="Banner / Cover Produk (Header Halaman Topup)"
                                            value={editingProduct.banner_url || ''}
                                            onChange={(val) => setEditingProduct({ ...editingProduct, banner_url: val })}
                                            placeholder="https://... atau /images/..."
                                            description="Opsional: Cover banner lebar di bagian header detail produk. Jika kosong, akan memakai icon produk."
                                            folder="products"
                                            aspectRatio="banner"
                                        />
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-bold text-gray-300 mb-1">Deskripsi Singkat</label>
                                        <textarea
                                            rows={3}
                                            value={editingProduct.description || ''}
                                            onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                                            placeholder="Deskripsi produk, garansi pengiriman, dll."
                                            className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-300 mb-1">Badge Tag</label>
                                        <input
                                            type="text"
                                            value={editingProduct.badge || ''}
                                            onChange={(e) => setEditingProduct({ ...editingProduct, badge: e.target.value })}
                                            placeholder="POPULER, HOT VIP, PROMO"
                                            className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-300 mb-1">Label Input User ID</label>
                                        <input
                                            type="text"
                                            value={editingProduct.input_label_1 || ''}
                                            onChange={(e) => setEditingProduct({ ...editingProduct, input_label_1: e.target.value })}
                                            placeholder="Player ID, User ID, Target"
                                            className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                                        />
                                    </div>

                                    <div className="sm:col-span-2 space-y-2 p-3.5 rounded-xl bg-[#060a1c] border border-[#1a2a5a]">
                                        <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
                                            Status Visibilitas Produk
                                        </label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                            <button
                                                type="button"
                                                onClick={() => setEditingProduct({ ...editingProduct, is_active: true })}
                                                className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${editingProduct.is_active
                                                    ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-lg shadow-emerald-950/40'
                                                    : 'bg-[#0a1230]/60 border-[#1a2a5a] text-gray-400 hover:border-gray-600'
                                                    }`}
                                            >
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${editingProduct.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-500'
                                                    }`}>
                                                    <Eye className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <div className="text-xs font-bold flex items-center gap-1.5">
                                                        <span>🟢 Publik (Aktif)</span>
                                                        {editingProduct.is_active && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                                                    </div>
                                                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                                                        Tampil di katalog web publik dan dapat langsung dibeli oleh customer.
                                                    </p>
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setEditingProduct({ ...editingProduct, is_active: false })}
                                                className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${!editingProduct.is_active
                                                    ? 'bg-amber-500/15 border-amber-500 text-white shadow-lg shadow-amber-950/40'
                                                    : 'bg-[#0a1230]/60 border-[#1a2a5a] text-gray-400 hover:border-gray-600'
                                                    }`}
                                            >
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${!editingProduct.is_active ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-800 text-gray-500'
                                                    }`}>
                                                    <Lock className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <div className="text-xs font-bold flex items-center gap-1.5">
                                                        <span>🔒 Private (Draft)</span>
                                                        {!editingProduct.is_active && <Check className="w-3.5 h-3.5 text-amber-400" />}
                                                    </div>
                                                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                                                        Disembunyikan dari publik. Hanya bisa dilihat dan dikelola oleh admin.
                                                    </p>
                                                </div>
                                            </button>
                                        </div>

                                        <div className="pt-2 border-t border-[#1a2a5a] flex items-center gap-6">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={editingProduct.has_zone_id}
                                                    onChange={(e) => setEditingProduct({ ...editingProduct, has_zone_id: e.target.checked })}
                                                    className="w-4 h-4 text-blue-600 rounded bg-[#060a1c] border-blue-900"
                                                />
                                                <span className="text-xs text-gray-300 font-bold">Perlu Server / Zone ID</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className={`sm:col-span-2 space-y-2.5 p-3.5 rounded-xl border transition-all ${editingProduct.maintenance
                                        ? 'bg-orange-500/10 border-orange-500/50'
                                        : 'bg-[#060a1c] border-[#1a2a5a]'
                                        }`}>
                                        <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
                                            Mode Maintenance
                                        </label>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={Boolean(editingProduct.maintenance)}
                                            onClick={() => setEditingProduct({ ...editingProduct, maintenance: !editingProduct.maintenance })}
                                            className={`w-full p-3 rounded-xl border text-left flex items-center gap-3 transition-all ${editingProduct.maintenance
                                                ? 'bg-orange-500/15 border-orange-500 text-white'
                                                : 'bg-[#0a1230]/60 border-[#1a2a5a] text-gray-400 hover:border-gray-600'
                                                }`}
                                        >
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-base ${editingProduct.maintenance ? 'bg-orange-500/20' : 'bg-gray-800 grayscale'}`}>
                                                🛠️
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-bold flex items-center gap-1.5">
                                                    <span>{editingProduct.maintenance ? 'Maintenance AKTIF' : 'Maintenance nonaktif'}</span>
                                                    {editingProduct.maintenance && <Check className="w-3.5 h-3.5 text-orange-400" />}
                                                </div>
                                                <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                                                    Produk tetap tampil di katalog dengan label Maintenance, tapi tidak bisa dibeli (QRIS maupun saldo). Pesanan yang sudah dibayar tetap diproses.
                                                </p>
                                            </div>
                                            <span className={`shrink-0 w-10 h-6 rounded-full p-0.5 transition-colors ${editingProduct.maintenance ? 'bg-orange-500' : 'bg-gray-700'}`}>
                                                <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${editingProduct.maintenance ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </span>
                                        </button>

                                        {editingProduct.maintenance && (
                                            <div>
                                                <label className="block text-xs font-bold text-gray-300 mb-1">Pesan untuk Pembeli <span className="text-gray-500 font-normal">(opsional)</span></label>
                                                <textarea
                                                    rows={2}
                                                    maxLength={300}
                                                    value={editingProduct.maintenance_note || ''}
                                                    onChange={(e) => setEditingProduct({ ...editingProduct, maintenance_note: e.target.value })}
                                                    placeholder="Contoh: Sedang update versi game terbaru, estimasi selesai malam ini."
                                                    className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-orange-500"
                                                />
                                                <p className="text-[10px] text-gray-500 mt-1 text-right">{(editingProduct.maintenance_note || '').length}/300</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Sticky Footer */}
                            <div className="flex justify-end gap-2 px-5 sm:px-6 py-3.5 border-t border-[#1a2a5a] bg-[#08102a] shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsProductModalOpen(false)}
                                    className="px-4 py-2 rounded-xl bg-blue-950/60 hover:bg-blue-900/60 text-xs font-bold text-gray-300 transition-colors"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={saveLoading}
                                    className="coda-btn px-5 py-2 text-xs font-bold"
                                >
                                    {saveLoading ? 'Menyimpan...' : 'Simpan Produk'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ============================================================= */}
            {/* MODAL: KELOLA SKU / ITEM NOMINAL */}
            {/* ============================================================= */}
            {isSkuModalOpen && selectedProductForSku && (
                <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
                    <div className="w-full max-w-2xl bg-[#0a1230] border border-[#1a2a5a] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] my-auto overflow-hidden">
                        {/* Header Modal */}
                        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#1a2a5a] bg-[#08102a] shrink-0">
                            <div>
                                <h3 className="text-base font-black text-white flex items-center gap-2">
                                    <Layers className="w-5 h-5 text-blue-400" />
                                    <span>Kelola SKU Nominal: {selectedProductForSku.name}</span>
                                </h3>
                                <p className="text-xs text-gray-400">Atur paket harga, diamond, dan voucher lisensi untuk game ini.</p>
                            </div>
                            <button
                                onClick={() => setIsSkuModalOpen(false)}
                                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Scrollable Body */}
                        <div className="p-5 sm:p-6 overflow-y-auto modal-scrollable space-y-5 flex-1">
                            {/* List Existing Items */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                                        Daftar Item Aktif ({selectedProductForSku.items?.length || 0})
                                    </span>
                                    <span className="text-[10px] text-blue-400">
                                        Scroll list untuk melihat semua SKU
                                    </span>
                                </div>

                                <div className="divide-y divide-[#1a2a5a] border border-[#1a2a5a] rounded-xl overflow-y-auto max-h-60 bg-[#060a1c] modal-scrollable">
                                    {(selectedProductForSku.items || []).map((item) => {
                                        const itemStock = item.stock !== undefined ? Number(item.stock) : 999;
                                        const isReady = itemStock > 0 && item.is_active !== false;

                                        return (
                                            <div key={item.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                                                {item.icon_url && (
                                                    <img
                                                        src={item.icon_url}
                                                        alt={item.name}
                                                        className="w-8 h-8 rounded-lg object-cover border border-[#1a2a5a] shrink-0"
                                                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                                    />
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-black text-white">{item.name}</span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isReady
                                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                            : 'bg-red-500/20 text-red-300 border border-red-500/30'
                                                            }`}>
                                                            Stok: {itemStock} {isReady ? '✓ Ready' : '✗ Habis'}
                                                        </span>
                                                        {item.cost_usd && (
                                                            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-mono border border-blue-500/30">
                                                                Modal: ${item.cost_usd} (~Rp {Math.round(parseFloat(item.cost_usd) * 16000).toLocaleString('id-ID')})
                                                            </span>
                                                        )}
                                                        {item.badge && (
                                                            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold">
                                                                {item.badge}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-gray-400 text-[11px] font-mono block mt-0.5">{item.sku}</span>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <span className="font-bold text-blue-400 block">
                                                        Rp {item.price.toLocaleString('id-ID')}
                                                    </span>
                                                    {item.original_price > item.price && (
                                                        <span className="text-gray-400 text-[10px] line-through block">
                                                            Rp {item.original_price.toLocaleString('id-ID')}
                                                        </span>
                                                    )}
                                                    {item.cost_usd && item.price && (
                                                        <span className="text-[10px] text-emerald-400 font-bold block">
                                                            Untung: Rp {(item.price - Math.round(parseFloat(item.cost_usd) * 16000)).toLocaleString('id-ID')}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingSku({ ...item });
                                                            setTimeout(() => {
                                                                document.getElementById('sku-edit-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                                            }, 50);
                                                        }}
                                                        className="p-1.5 rounded-lg bg-blue-950 text-gray-300 hover:text-white hover:bg-blue-900 transition-colors"
                                                        title="Edit SKU & Harga"
                                                    >
                                                        <Edit3 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteSku(item.id)}
                                                        className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                                        title="Hapus SKU"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Form Add / Edit SKU */}
                            <form id="sku-edit-form" onSubmit={handleSaveSku} className="p-4 sm:p-5 rounded-xl bg-[#060a1c] border border-[#1a2a5a] space-y-3">
                                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                                    <span>{editingSku?.id ? '✏️ Edit Item SKU & Harga Jual' : '➕ Tambah Item SKU Baru'}</span>
                                    {editingSku?.id && (
                                        <span className="text-[10px] text-blue-400 font-normal normal-case">
                                            Sedang mengedit SKU #{editingSku.sku || editingSku.id}
                                        </span>
                                    )}
                                </h4>

                                {editingSku?.cost_usd && (
                                    <div className="p-3 rounded-lg bg-blue-950/40 border border-blue-800/40 text-xs text-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div>
                                            <span className="font-bold text-blue-300">Biaya Modal:</span>{' '}
                                            <span className="font-mono font-black text-white">${editingSku.cost_usd} USD</span> (± Rp {Math.round(parseFloat(editingSku.cost_usd) * 16000).toLocaleString('id-ID')})
                                        </div>
                                        {editingSku.price ? (
                                            <div>
                                                <span className="text-gray-400">Keuntungan Toko:</span>{' '}
                                                <span className="font-black text-emerald-400 font-mono">
                                                    Rp {(editingSku.price - Math.round(parseFloat(editingSku.cost_usd) * 16000)).toLocaleString('id-ID')}
                                                </span>
                                            </div>
                                        ) : null}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-300 mb-1">Nama Item</label>
                                        <input
                                            type="text"
                                            value={editingSku?.name || ''}
                                            onChange={(e) => setEditingSku({ ...editingSku, name: e.target.value })}
                                            placeholder="Contoh: 140 Diamonds, VIP 1 Hari"
                                            className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-300 mb-1">Kode SKU (ID varian Thanhub)</label>
                                        <input
                                            type="text"
                                            value={editingSku?.sku || ''}
                                            onChange={(e) => setEditingSku({ ...editingSku, sku: e.target.value })}
                                            placeholder="FF-140-DM, ABCD-PANEL-APKMOD-1D"
                                            className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-lg px-3 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-300 mb-1">Harga Asli / Coret (Rp)</label>
                                        <input
                                            type="number"
                                            value={editingSku?.original_price !== undefined ? editingSku.original_price : ''}
                                            onChange={(e) => {
                                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                                setEditingSku({ ...editingSku, original_price: val });
                                            }}
                                            placeholder="20000"
                                            className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-300 mb-1">
                                            Harga Jual Konsumen (Rp) <span className="text-blue-400 font-normal">*Bebas Anda Tentukan</span>
                                        </label>
                                        <input
                                            type="number"
                                            value={editingSku?.price !== undefined ? editingSku.price : ''}
                                            onChange={(e) => {
                                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                                setEditingSku({ ...editingSku, price: val });
                                            }}
                                            placeholder="15000"
                                            className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-lg px-3 py-1.5 text-white text-xs font-bold text-blue-400 focus:outline-none focus:border-blue-500"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-300 mb-1">Stok Tersedia (Cloud Supabase)</label>
                                        <input
                                            type="number"
                                            value={editingSku?.stock !== undefined ? editingSku.stock : 999}
                                            onChange={(e) => {
                                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                                setEditingSku({ ...editingSku, stock: val, in_stock: val > 0 });
                                            }}
                                            placeholder="999"
                                            className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-lg px-3 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-300 mb-1">Badge Tag</label>
                                        <input
                                            type="text"
                                            value={editingSku?.badge || ''}
                                            onChange={(e) => setEditingSku({ ...editingSku, badge: e.target.value })}
                                            placeholder="HEMAT, POPULER, BEST"
                                            className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-300 mb-1">Modal USD (Opsional)</label>
                                        <input
                                            type="text"
                                            value={editingSku?.cost_usd || ''}
                                            onChange={(e) => setEditingSku({ ...editingSku, cost_usd: e.target.value })}
                                            placeholder="0.70"
                                            className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-lg px-3 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                        />
                                    </div>

                                    <div className="sm:col-span-2">
                                        <ImageFieldEditor
                                            label="Icon Varian SKU (Opsional)"
                                            value={editingSku?.icon_url || ''}
                                            onChange={(val) => setEditingSku({ ...editingSku, icon_url: val })}
                                            placeholder="https://... atau /images/..."
                                            description="Opsional: Ikon/foto khusus untuk item SKU ini (contoh: logo diamond, koin, atau durasi)."
                                            folder="skus"
                                            aspectRatio="square"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 pt-2">
                                    {editingSku && (
                                        <button
                                            type="button"
                                            onClick={() => setEditingSku(null)}
                                            className="px-3 py-1.5 rounded-lg bg-blue-950 text-gray-400 text-xs hover:text-white transition-colors"
                                        >
                                            Batal Edit
                                        </button>
                                    )}
                                    <button
                                        type="submit"
                                        disabled={saveLoading}
                                        className="coda-btn px-4 py-1.5 text-xs font-bold"
                                    >
                                        {editingSku?.id ? 'Simpan Perubahan SKU' : 'Tambah SKU'}
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* Sticky Footer */}
                        <div className="flex justify-end px-5 sm:px-6 py-3.5 border-t border-[#1a2a5a] bg-[#08102a] shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsSkuModalOpen(false)}
                                className="px-4 py-2 rounded-xl bg-blue-950/60 hover:bg-blue-900/60 text-xs font-bold text-gray-300 transition-colors"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================= */}
            {/* MODAL: TAMBAH / EDIT BANNER */}
            {/* ============================================================= */}
            {isBannerModalOpen && editingBanner && (
                <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
                    <div className="w-full max-w-lg bg-[#0a1230] border border-[#1a2a5a] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] my-auto overflow-hidden">
                        {/* Header Modal */}
                        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#1a2a5a] bg-[#08102a] shrink-0">
                            <h3 className="text-base font-black text-white">
                                {editingBanner.id && settings?.banners?.some(b => b.id === editingBanner.id) ? 'Edit Banner Promo' : 'Tambah Banner Promo Baru'}
                            </h3>
                            <button
                                onClick={() => setIsBannerModalOpen(false)}
                                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Scrollable Form Body */}
                        <form onSubmit={handleSaveBanner} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                            <div className="p-5 sm:p-6 overflow-y-auto modal-scrollable space-y-3.5 flex-1">
                                {/* Pilih cepat dari produk toko */}
                                {products && products.length > 0 && (
                                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-1.5">
                                        <label className="block text-xs font-bold text-blue-300 flex items-center gap-1.5">
                                            <Sparkles className="w-3.5 h-3.5" />
                                            <span>Pilih Cepat Dari Produk Toko (Auto-Fill)</span>
                                        </label>
                                        <select
                                            className="w-full bg-[#060a1c] border border-blue-500/40 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                                            onChange={(e) => {
                                                const prod = products.find(p => p.slug === e.target.value);
                                                if (prod) {
                                                    setEditingBanner({
                                                        ...editingBanner,
                                                        title: prod.name.toUpperCase(),
                                                        subtitle: prod.description || `Lisensi ${prod.name}. Auto Delivery 1 Detik Langsung ke Gmail!`,
                                                        badge: 'PREMIUM',
                                                        slug: prod.slug,
                                                        image: prod.banner_url || prod.icon_url,
                                                        buttonText: 'Beli Lisensi Sekarang',
                                                    });
                                                }
                                            }}
                                            defaultValue=""
                                        >
                                            <option value="" disabled>-- Pilih salah satu produk --</option>
                                            {products.map((p) => (
                                                <option key={p.id} value={p.slug}>
                                                    {p.name} (/{p.slug})
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-[10px] text-gray-400">
                                            Pilih produk untuk mengisi otomatis Judul, Deskripsi, Slug, dan Gambar produk.
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold text-gray-300 mb-1">Judul Utama Banner</label>
                                    <input
                                        type="text"
                                        value={editingBanner.title || ''}
                                        onChange={(e) => setEditingBanner({ ...editingBanner, title: e.target.value })}
                                        placeholder="Contoh: CHEAT VIP AUTO HEADSHOT"
                                        className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-300 mb-1">Sub Judul / Penjelasan Promo</label>
                                    <input
                                        type="text"
                                        value={editingBanner.subtitle || ''}
                                        onChange={(e) => setEditingBanner({ ...editingBanner, subtitle: e.target.value })}
                                        placeholder="Mod Menu Free Fire VIP, Auto Aim, ESP..."
                                        className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-300 mb-1">Badge Tag</label>
                                        <input
                                            type="text"
                                            value={editingBanner.badge || ''}
                                            onChange={(e) => setEditingBanner({ ...editingBanner, badge: e.target.value })}
                                            placeholder="EXCLUSIVE VIP"
                                            className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-300 mb-1">Link Target / Slug</label>
                                        <input
                                            type="text"
                                            value={editingBanner.slug || ''}
                                            onChange={(e) => setEditingBanner({ ...editingBanner, slug: e.target.value })}
                                            placeholder="aim-hack-apkmod"
                                            className="w-full bg-[#060a1c] border border-[#1a2a5a] rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <ImageFieldEditor
                                        label="Gambar Banner Promosi"
                                        value={editingBanner.image || ''}
                                        onChange={(val) => setEditingBanner({ ...editingBanner, image: val })}
                                        placeholder="/images/aimhack.jpg atau URL gambar..."
                                        description="Format landscape / lebar. Mendukung input URL atau upload foto dari galeri/perangkat."
                                        folder="banners"
                                        aspectRatio="banner"
                                        required
                                    />
                                </div>

                                {/* Live Preview of Banner Card */}
                                {editingBanner.image && (
                                    <div className="p-3 rounded-xl bg-[#060a1c] border border-[#1a2a5a] space-y-2">
                                        <span className="text-[11px] font-bold text-gray-400">Mockup Banner di Homepage:</span>
                                        <div className="flex items-center gap-3">
                                            <div className="w-16 h-16 rounded-xl overflow-hidden bg-blue-950 border border-blue-500/30 shrink-0">
                                                <img
                                                    src={editingBanner.image}
                                                    alt="Preview"
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                                />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase">
                                                    {editingBanner.badge || 'VIP'}
                                                </span>
                                                <p className="text-xs font-bold text-white truncate mt-1">{editingBanner.title || 'Judul Banner'}</p>
                                                <p className="text-[10px] text-gray-400 line-clamp-1">{editingBanner.subtitle || 'Deskripsi banner...'}</p>
                                                <span className="text-[10px] text-blue-400 font-mono">Target: /topup/{editingBanner.slug || '...'}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Sticky Footer */}
                            <div className="flex justify-end gap-2 px-5 sm:px-6 py-3.5 border-t border-[#1a2a5a] bg-[#08102a] shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsBannerModalOpen(false)}
                                    className="px-4 py-2 rounded-xl bg-blue-950/60 hover:bg-blue-900/60 text-xs font-bold text-gray-300 transition-colors"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={saveLoading}
                                    className="coda-btn px-5 py-2 text-xs font-bold"
                                >
                                    {saveLoading ? 'Menyimpan...' : 'Simpan Banner'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ============================================================= */}
            {/* MODAL: ATUR KEUNTUNGAN & HARGA MASSAL (BULK PRICING) */}
            {/* ============================================================= */}
            {isBulkModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
                    <div className="w-full max-w-3xl bg-[#0a1230] border border-[#1a2a5a] rounded-2xl shadow-2xl flex flex-col max-h-[92vh] my-auto overflow-hidden">

                        {/* Header Modal */}
                        <div className="flex items-start justify-between px-5 sm:px-6 py-4 border-b border-[#1a2a5a] bg-[#08102a] shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 flex-shrink-0">
                                    <Sliders className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                                        <span>Atur Keuntungan & Markup Massal</span>
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                                            BULK PRICING
                                        </span>
                                    </h3>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        Tentukan keuntungan (Rp nominal atau %) untuk semua produk sekaligus atau produk pilihan Anda.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsBulkModalOpen(false)}
                                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Scrollable Body */}
                        <div className="p-5 sm:p-6 overflow-y-auto modal-scrollable space-y-5 flex-1">

                            {/* STEP 1: PILIH TARGET PRODUK */}
                            <div className="space-y-3 p-4 rounded-2xl bg-[#060a1c] border border-[#1a2a5a]">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-black flex items-center justify-center">1</span>
                                        <span>Pilih Target Produk</span>
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        {bulkTargetMode === 'ALL' && `Semua Produk (${products.length})`}
                                        {bulkTargetMode === 'APKMOD' && `Produk APK Mod Android (${products.filter(p => p.slug.includes('apkmod') || p.slug.includes('proxy') || p.slug.includes('wire') || p.slug.includes('mod') || (p.badge?.includes('APK') ?? false)).length})`}
                                        {bulkTargetMode === 'IOS_ROOT' && `iOS, Root & PC (${products.filter(p => p.slug.includes('ios') || p.slug.includes('root') || p.slug.includes('pc') || p.slug.includes('gbox') || (p.badge?.includes('iOS') ?? false) || (p.badge?.includes('ROOT') ?? false)).length})`}
                                        {bulkTargetMode === 'CUSTOM' && `${bulkSelectedSlugs.length} dari ${products.length} produk terpilih`}
                                    </span>
                                </div>

                                {/* Mode Pilihan */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setBulkTargetMode('ALL');
                                            fetchBulkPreview({ mode: 'ALL' });
                                        }}
                                        className={`p-3 rounded-xl border text-left transition-all ${bulkTargetMode === 'ALL'
                                            ? 'bg-emerald-600/20 border-emerald-500/50 text-white shadow-md shadow-emerald-950/40'
                                            : 'bg-[#0a1230] border-[#1a2a5a] text-gray-400 hover:border-gray-600'
                                            }`}
                                    >
                                        <span className="text-xs font-bold block">Semua Produk</span>
                                        <span className="text-[10px] text-emerald-400 font-mono mt-0.5 block">{products.length} Cheat VIP</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setBulkTargetMode('APKMOD');
                                            fetchBulkPreview({ mode: 'APKMOD' });
                                        }}
                                        className={`p-3 rounded-xl border text-left transition-all ${bulkTargetMode === 'APKMOD'
                                            ? 'bg-blue-600/20 border-blue-500/50 text-white shadow-md shadow-blue-950/40'
                                            : 'bg-[#0a1230] border-[#1a2a5a] text-gray-400 hover:border-gray-600'
                                            }`}
                                    >
                                        <span className="text-xs font-bold block">APK Mod Android</span>
                                        <span className="text-[10px] text-blue-400 font-mono mt-0.5 block">
                                            {products.filter(p => p.slug.includes('apkmod') || p.slug.includes('proxy') || p.slug.includes('wire') || p.slug.includes('mod') || (p.badge?.includes('APK') ?? false)).length} Cheat APK
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setBulkTargetMode('IOS_ROOT');
                                            fetchBulkPreview({ mode: 'IOS_ROOT' });
                                        }}
                                        className={`p-3 rounded-xl border text-left transition-all ${bulkTargetMode === 'IOS_ROOT'
                                            ? 'bg-indigo-600/20 border-indigo-500/50 text-white shadow-md shadow-indigo-950/40'
                                            : 'bg-[#0a1230] border-[#1a2a5a] text-gray-400 hover:border-gray-600'
                                            }`}
                                    >
                                        <span className="text-xs font-bold block">iOS / Root / PC</span>
                                        <span className="text-[10px] text-indigo-400 font-mono mt-0.5 block">
                                            {products.filter(p => p.slug.includes('ios') || p.slug.includes('root') || p.slug.includes('pc') || p.slug.includes('gbox') || (p.badge?.includes('iOS') ?? false) || (p.badge?.includes('ROOT') ?? false)).length} Panel VIP
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setBulkTargetMode('CUSTOM');
                                            fetchBulkPreview({ mode: 'CUSTOM' });
                                        }}
                                        className={`p-3 rounded-xl border text-left transition-all ${bulkTargetMode === 'CUSTOM'
                                            ? 'bg-blue-600/20 border-blue-500/50 text-white shadow-md shadow-blue-950/40'
                                            : 'bg-[#0a1230] border-[#1a2a5a] text-gray-400 hover:border-gray-600'
                                            }`}
                                    >
                                        <span className="text-xs font-bold block">Pilih Sendiri</span>
                                        <span className="text-[10px] text-blue-400 font-mono mt-0.5 block">Custom Checkbox</span>
                                    </button>
                                </div>

                                {/* Daftar Checkbox Jika Mode Custom */}
                                {bulkTargetMode === 'CUSTOM' && (
                                    <div className="space-y-2 pt-2 border-t border-[#1a2a5a]">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <div className="relative flex-1 min-w-[200px]">
                                                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                                                <input
                                                    type="text"
                                                    value={bulkSearchProduct}
                                                    onChange={(e) => setBulkSearchProduct(e.target.value)}
                                                    placeholder="Cari produk yang ingin dipilih..."
                                                    className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-xl pl-8 pr-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const allSlugs = products.map(p => p.slug);
                                                        setBulkSelectedSlugs(allSlugs);
                                                        fetchBulkPreview({ mode: 'CUSTOM', slugs: allSlugs });
                                                    }}
                                                    className="px-2.5 py-1 rounded-lg bg-blue-950/60 hover:bg-blue-900/60 text-[11px] font-bold text-gray-300"
                                                >
                                                    Pilih Semua ({products.length})
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setBulkSelectedSlugs([]);
                                                        setBulkPreviewItems([]);
                                                    }}
                                                    className="px-2.5 py-1 rounded-lg bg-blue-950/60 hover:bg-blue-900/60 text-[11px] font-bold text-gray-300"
                                                >
                                                    Batal Pilih
                                                </button>
                                            </div>
                                        </div>

                                        <div className="max-h-48 overflow-y-auto divide-y divide-[#1a2a5a] border border-[#1a2a5a] rounded-xl bg-[#060a1c] p-2 space-y-1">
                                            {products
                                                .filter(p => p.name.toLowerCase().includes(bulkSearchProduct.toLowerCase()) || p.slug.toLowerCase().includes(bulkSearchProduct.toLowerCase()))
                                                .map((prod) => {
                                                    const isChecked = bulkSelectedSlugs.includes(prod.slug);
                                                    return (
                                                        <label
                                                            key={prod.slug}
                                                            className={`p-2 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-colors ${isChecked ? 'bg-blue-950/50' : 'hover:bg-[#101a3b]'}`}
                                                        >
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={(e) => {
                                                                        let newSlugs: string[];
                                                                        if (e.target.checked) {
                                                                            newSlugs = [...bulkSelectedSlugs, prod.slug];
                                                                        } else {
                                                                            newSlugs = bulkSelectedSlugs.filter(s => s !== prod.slug);
                                                                        }
                                                                        setBulkSelectedSlugs(newSlugs);
                                                                        fetchBulkPreview({ mode: 'CUSTOM', slugs: newSlugs });
                                                                    }}
                                                                    className="rounded border-[#1a2a5a] text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
                                                                />
                                                                <img
                                                                    src={prod.icon_url}
                                                                    alt={prod.name}
                                                                    className="w-7 h-7 rounded-lg object-cover border border-[#1a2a5a] flex-shrink-0"
                                                                />
                                                                <div className="min-w-0">
                                                                    <span className="text-xs font-bold text-white block truncate">{prod.name}</span>
                                                                    <span className="text-[10px] text-gray-400 block">{prod.publisher} • {prod.items?.length || 0} SKU</span>
                                                                </div>
                                                            </div>
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 font-mono flex-shrink-0">
                                                                {prod.badge || 'PROMO'}
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* STEP 2: METODE KEUNTUNGAN (NOMINAL ATAU PERSEN) */}
                            <div className="space-y-4 p-4 rounded-2xl bg-[#060a1c] border border-[#1a2a5a]">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-black flex items-center justify-center">2</span>
                                        <span>Tentukan Nilai Keuntungan (Markup)</span>
                                    </span>
                                </div>

                                {/* Pilihan Model */}
                                <div className="flex rounded-xl bg-[#0a1230] p-1 border border-[#1a2a5a]">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setBulkMarkupType('fixed');
                                            fetchBulkPreview({ type: 'fixed' });
                                        }}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${bulkMarkupType === 'fixed'
                                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                                            : 'text-gray-400 hover:text-white'
                                            }`}
                                    >
                                        <DollarSign className="w-4 h-4" />
                                        <span>Nominal Tetap (Rp)</span>
                                        <span className="text-[10px] opacity-80">(Misal: Untung Rp 1.000)</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setBulkMarkupType('percent');
                                            fetchBulkPreview({ type: 'percent', val: bulkMarkupValue === 1000 ? 25 : bulkMarkupValue });
                                            if (bulkMarkupValue === 1000) setBulkMarkupValue(25);
                                        }}
                                        className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${bulkMarkupType === 'percent'
                                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                                            : 'text-gray-400 hover:text-white'
                                            }`}
                                    >
                                        <Percent className="w-4 h-4" />
                                        <span>Persentase (%)</span>
                                        <span className="text-[10px] opacity-80">(Misal: Untung 25%)</span>
                                    </button>
                                </div>

                                {/* Input Nilai & Preset Buttons */}
                                <div className="space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                        <div className="flex-1">
                                            <label className="block text-[11px] font-bold text-gray-300 mb-1">
                                                {bulkMarkupType === 'fixed' ? 'Nominal Keuntungan per SKU (Rupiah)' : 'Persentase Keuntungan (%)'}
                                            </label>
                                            <div className="relative">
                                                <span className="absolute left-3.5 top-2 text-xs font-bold text-gray-400">
                                                    {bulkMarkupType === 'fixed' ? 'Rp' : '+'}
                                                </span>
                                                <input
                                                    type="number"
                                                    value={bulkMarkupValue}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value) || 0;
                                                        setBulkMarkupValue(val);
                                                        fetchBulkPreview({ val });
                                                    }}
                                                    className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-xl pl-10 pr-4 py-2 text-white font-bold text-sm focus:outline-none focus:border-emerald-500"
                                                    min={0}
                                                    step={bulkMarkupType === 'fixed' ? 500 : 5}
                                                />
                                                {bulkMarkupType === 'percent' && (
                                                    <span className="absolute right-3.5 top-2 text-xs font-bold text-gray-400">%</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Presets */}
                                        <div className="sm:self-end">
                                            <label className="block text-[11px] font-bold text-gray-400 mb-1">Pilihan Cepat:</label>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {bulkMarkupType === 'fixed' ? (
                                                    <>
                                                        {[1000, 2000, 3000, 5000, 10000].map((preset) => (
                                                            <button
                                                                key={preset}
                                                                type="button"
                                                                onClick={() => {
                                                                    setBulkMarkupValue(preset);
                                                                    fetchBulkPreview({ val: preset });
                                                                }}
                                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${bulkMarkupValue === preset
                                                                    ? 'bg-emerald-500 text-slate-950'
                                                                    : 'bg-[#0a1230] border border-[#1a2a5a] text-gray-300 hover:text-white'
                                                                    }`}
                                                            >
                                                                +{preset >= 1000 ? `${preset / 1000}k` : preset}
                                                            </button>
                                                        ))}
                                                    </>
                                                ) : (
                                                    <>
                                                        {[15, 20, 25, 35, 50, 100].map((preset) => (
                                                            <button
                                                                key={preset}
                                                                type="button"
                                                                onClick={() => {
                                                                    setBulkMarkupValue(preset);
                                                                    fetchBulkPreview({ val: preset });
                                                                }}
                                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${bulkMarkupValue === preset
                                                                    ? 'bg-emerald-500 text-slate-950'
                                                                    : 'bg-[#0a1230] border border-[#1a2a5a] text-gray-300 hover:text-white'
                                                                    }`}
                                                            >
                                                                +{preset}%
                                                            </button>
                                                        ))}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <p className="text-[11px] text-gray-400">
                                        💡 {bulkMarkupType === 'fixed'
                                            ? `Setiap SKU akan dihitung dari Modal USD × Kurs + Rp ${Number(bulkMarkupValue).toLocaleString('id-ID')}.`
                                            : `Setiap SKU akan dinaikkan sebesar ${bulkMarkupValue}% di atas harga modal.`
                                        }
                                    </p>
                                </div>
                            </div>

                            {/* STEP 3: PENGATURAN KURS & PEMBULATAN */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-[#060a1c] border border-[#1a2a5a]">
                                <div>
                                    <label className="block text-[11px] font-bold text-gray-300 mb-1">
                                        Kurs 1 USD ke Rupiah
                                    </label>
                                    <input
                                        type="number"
                                        value={bulkUsdRate}
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 16000;
                                            setBulkUsdRate(val);
                                            fetchBulkPreview({ usd: val });
                                        }}
                                        className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-xl px-3 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                                    />
                                    <span className="text-[10px] text-gray-400 block mt-0.5">Default: Rp 16.000</span>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-gray-300 mb-1">
                                        Pembulatan Harga Jual
                                    </label>
                                    <select
                                        value={bulkRounding}
                                        onChange={(e) => {
                                            const round = Number(e.target.value);
                                            setBulkRounding(round);
                                            fetchBulkPreview({ round });
                                        }}
                                        className="w-full bg-[#0a1230] border border-[#1a2a5a] rounded-xl px-3 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500"
                                    >
                                        <option value={1000}>Kelipatan Rp 1.000 (Paling Rapi)</option>
                                        <option value={500}>Kelipatan Rp 500</option>
                                        <option value={100}>Kelipatan Rp 100</option>
                                        <option value={0}>Persis (Tanpa Pembulatan)</option>
                                    </select>
                                    <span className="text-[10px] text-gray-400 block mt-0.5">Misal: 4.800 + 1k = 5.800 (pilih Rp 100/Persis)</span>
                                </div>

                                <div className="flex flex-col justify-center">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={bulkUpdateOriginalPrice}
                                            onChange={(e) => setBulkUpdateOriginalPrice(e.target.checked)}
                                            className="rounded border-[#1a2a5a] text-emerald-500 focus:ring-0 w-4 h-4 cursor-pointer"
                                        />
                                        <span className="text-xs font-bold text-gray-300">Update Harga Coret (+25%)</span>
                                    </label>
                                    <span className="text-[10px] text-gray-400 block mt-1 ml-6">
                                        Untuk menampilkan promo diskon di mata pembeli.
                                    </span>
                                </div>
                            </div>

                            {/* STEP 4: PRATINJAU REAL-TIME */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                                        <span>Simulasi Hasil Perhitungan Harga (Sampel SKU)</span>
                                    </span>
                                    {bulkPreviewLoading && (
                                        <span className="text-xs text-emerald-400 flex items-center gap-1.5 animate-pulse font-mono">
                                            <RefreshCw className="w-3 h-3 animate-spin" /> Menghitung...
                                        </span>
                                    )}
                                </div>

                                <div className="border border-[#1a2a5a] rounded-xl overflow-hidden bg-[#060a1c]">
                                    <div className="overflow-x-auto max-h-52">
                                        <table className="w-full text-left text-xs text-gray-300">
                                            <thead className="bg-[#0a1230] text-blue-300 font-bold uppercase tracking-wider border-b border-[#1a2a5a] sticky top-0">
                                                <tr>
                                                    <th className="px-3 py-2.5">Produk & Durasi SKU</th>
                                                    <th className="px-3 py-2.5">Modal Asli</th>
                                                    <th className="px-3 py-2.5">Harga Jual Baru</th>
                                                    <th className="px-3 py-2.5">Harga Coret</th>
                                                    <th className="px-3 py-2.5 text-right">Untung Anda</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#1a2a5a]">
                                                {bulkPreviewItems.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                                                            Tidak ada item yang dipilih untuk disimulasikan.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    bulkPreviewItems.slice(0, 10).map((it, idx) => (
                                                        <tr key={`${it.productSlug}-${it.itemSku}-${idx}`} className="hover:bg-[#0a1230]/50">
                                                            <td className="px-3 py-2">
                                                                <span className="font-bold text-white block truncate max-w-[200px]">{it.itemName}</span>
                                                                <span className="text-[10px] text-gray-400 block">{it.productName}</span>
                                                            </td>
                                                            <td className="px-3 py-2 whitespace-nowrap">
                                                                {it.costUsd ? (
                                                                    <span className="text-blue-300 font-mono block">${it.costUsd} (~Rp {it.costIdr.toLocaleString('id-ID')})</span>
                                                                ) : (
                                                                    <span className="text-gray-400 font-mono block">Rp {it.costIdr.toLocaleString('id-ID')}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 whitespace-nowrap">
                                                                <span className="font-black text-emerald-400 text-xs block">
                                                                    Rp {it.newPrice.toLocaleString('id-ID')}
                                                                </span>
                                                                <span className="text-gray-500 text-[10px] line-through block">
                                                                    Lama: Rp {it.oldPrice.toLocaleString('id-ID')}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 whitespace-nowrap">
                                                                <span className="text-gray-400 text-[11px] line-through">
                                                                    Rp {it.newOriginalPrice.toLocaleString('id-ID')}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 whitespace-nowrap text-right">
                                                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-xs">
                                                                    +Rp {it.profit.toLocaleString('id-ID')}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Action */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 sm:px-6 py-3.5 border-t border-[#1a2a5a] bg-[#08102a] shrink-0">
                            <span className="text-xs text-gray-400">
                                ✨ Perubahan harga akan langsung live detik itu juga di etalase web dan Supabase.
                            </span>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsBulkModalOpen(false)}
                                    className="px-4 py-2 rounded-xl bg-blue-950/60 hover:bg-blue-900/60 text-xs font-bold text-gray-300 transition-colors"
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    onClick={handleApplyBulkPricing}
                                    disabled={bulkLoading}
                                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/50 disabled:opacity-50 transition-all"
                                >
                                    {bulkLoading ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            <span>Menerapkan ke Database...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sliders className="w-4 h-4" />
                                            <span>Terapkan Harga Sekarang</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* ============================================================= */}
            {/* FLOATING WINDOW: NOTIFIKASI DATABASE & PEMBAYARAN */}
            {/* ============================================================= */}
            {floatingModal.isOpen && (
                <div
                    className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) closeFloatingModal();
                    }}
                >
                    <div className="w-full max-w-lg bg-[#0a1230] border border-[#1a2a5a] rounded-3xl shadow-2xl overflow-hidden relative flex flex-col max-h-[92vh] my-auto animate-in zoom-in-95 duration-200">
                        {/* Glow effect matching modal type */}
                        <div
                            className={`absolute -top-24 -left-24 w-60 h-60 rounded-full blur-3xl pointer-events-none ${floatingModal.type === 'success' || floatingModal.type === 'payment_paid'
                                ? 'bg-emerald-500/20'
                                : floatingModal.type === 'payment_not_detected'
                                    ? 'bg-amber-500/20'
                                    : floatingModal.type === 'error'
                                        ? 'bg-red-500/20'
                                        : 'bg-blue-500/20'
                                }`}
                        />
                        <div
                            className={`absolute -bottom-24 -right-24 w-60 h-60 rounded-full blur-3xl pointer-events-none ${floatingModal.type === 'success' || floatingModal.type === 'payment_paid'
                                ? 'bg-emerald-600/15'
                                : floatingModal.type === 'payment_not_detected'
                                    ? 'bg-amber-600/15'
                                    : floatingModal.type === 'error'
                                        ? 'bg-red-600/15'
                                        : 'bg-indigo-600/15'
                                }`}
                        />

                        {/* Top Header with Icon & Close */}
                        <div className="p-5 sm:p-6 pb-4 border-b border-[#1a2a5a] bg-[#08102a] relative z-10 flex items-start justify-between gap-4 shrink-0">
                            <div className="flex items-center gap-3.5">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg ${floatingModal.type === 'success' || floatingModal.type === 'payment_paid'
                                    ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-emerald-600/30 ring-4 ring-emerald-500/20'
                                    : floatingModal.type === 'payment_not_detected'
                                        ? 'bg-gradient-to-tr from-amber-600 to-yellow-500 text-white shadow-amber-600/30 ring-4 ring-amber-500/20 animate-pulse'
                                        : floatingModal.type === 'error'
                                            ? 'bg-gradient-to-tr from-red-600 to-rose-500 text-white shadow-red-600/30 ring-4 ring-red-500/20'
                                            : 'bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-blue-600/30 ring-4 ring-blue-500/20'
                                    }`}>
                                    {floatingModal.type === 'success' && <CheckCircle2 className="w-6 h-6" />}
                                    {floatingModal.type === 'payment_paid' && <Sparkles className="w-6 h-6" />}
                                    {floatingModal.type === 'payment_not_detected' && <AlertTriangle className="w-6 h-6" />}
                                    {floatingModal.type === 'error' && <AlertCircle className="w-6 h-6" />}
                                    {floatingModal.type === 'info' && <Database className="w-6 h-6" />}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase border ${floatingModal.type === 'success' || floatingModal.type === 'payment_paid'
                                            ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400'
                                            : floatingModal.type === 'payment_not_detected'
                                                ? 'bg-amber-950/80 border-amber-500/40 text-amber-300'
                                                : floatingModal.type === 'error'
                                                    ? 'bg-red-950/80 border-red-500/40 text-red-400'
                                                    : 'bg-blue-950/80 border-blue-500/40 text-blue-300'
                                            }`}>
                                            {floatingModal.dbStatus === 'updated' && '✓ DATABASE SUPABASE UPDATED'}
                                            {floatingModal.dbStatus === 'error' && '✕ DATABASE GAGAL / ERROR'}
                                            {floatingModal.dbStatus === 'pending' && '⏳ GATEWAY: BELUM TERDETEKSI'}
                                            {floatingModal.dbStatus === 'synced' && '✓ CLOUD SYNCHRONIZED'}
                                            {!floatingModal.dbStatus && (floatingModal.actionType || 'STATUS WINDOW')}
                                        </span>
                                        {floatingModal.dbTable && (
                                            <span className="text-[10px] font-mono text-gray-400 bg-[#16224a] px-2 py-0.5 rounded border border-[#1a2a5a]">
                                                table: {floatingModal.dbTable}
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-base sm:text-lg font-black text-white mt-1 leading-snug">
                                        {floatingModal.title}
                                    </h3>
                                </div>
                            </div>
                            <button
                                onClick={closeFloatingModal}
                                className="text-gray-400 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors flex-shrink-0"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Scrollable Modal Content */}
                        <div className="p-5 sm:p-6 overflow-y-auto modal-scrollable space-y-4 relative z-10 flex-1">
                            {/* Subtitle / Description */}
                            {floatingModal.subtitle && (
                                <p className="text-xs text-gray-300 leading-relaxed bg-[#060a1c]/80 p-3.5 rounded-2xl border border-[#1a2a5a]">
                                    {floatingModal.subtitle}
                                </p>
                            )}

                            {/* Details List */}
                            {floatingModal.details && floatingModal.details.length > 0 && (
                                <div className="space-y-2 bg-[#060a1c] border border-[#1a2a5a] rounded-2xl p-4">
                                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                                        Rincian Perubahan & Konfirmasi:
                                    </span>
                                    {floatingModal.details.map((item, idx) => (
                                        <div key={idx} className="flex items-start justify-between gap-3 text-xs py-1 border-b border-[#1a2a5a]/40 last:border-b-0">
                                            <span className="text-gray-400">{item.label}</span>
                                            <span className="font-semibold text-white text-right break-all">
                                                {item.value}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Bulk Check Details (If from Cek Semua Pembayaran) */}
                            {floatingModal.bulkDetails && floatingModal.bulkDetails.length > 0 && (
                                <div className="space-y-2">
                                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                                        Rincian Per Pesanan ({floatingModal.bulkDetails.length} transaksi):
                                    </span>
                                    <div className="max-h-56 overflow-y-auto border border-[#1a2a5a] rounded-2xl bg-[#060a1c] divide-y divide-[#1a2a5a]">
                                        {floatingModal.bulkDetails.map((bItem, bIdx) => (
                                            <div key={bIdx} className="p-3 flex items-center justify-between gap-3 hover:bg-[#0a1230]/50">
                                                <div className="min-w-0">
                                                    <span className="font-mono text-xs font-bold text-white block truncate">
                                                        {bItem.invoice_no}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 block truncate">
                                                        {bItem.product_name} • Rp {Number(bItem.total_amount).toLocaleString('id-ID')}
                                                    </span>
                                                </div>
                                                <div className="flex-shrink-0 text-right">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${bItem.isPaid
                                                        ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400'
                                                        : 'bg-amber-950/80 border-amber-500/40 text-amber-300'
                                                        }`}>
                                                        {bItem.isPaid ? '✓ LUNAS' : 'PENDING'}
                                                    </span>
                                                    <span className="text-[9px] text-gray-400 block mt-0.5">
                                                        {bItem.message}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer Action Buttons */}
                        <div className="p-4 sm:p-5 border-t border-[#1a2a5a] bg-[#08102a] relative z-10 flex items-center justify-end gap-2.5 shrink-0">
                            {floatingModal.secondaryButton ? (
                                <button
                                    type="button"
                                    onClick={floatingModal.secondaryButton.onClick || closeFloatingModal}
                                    className="px-4 py-2 rounded-xl bg-blue-950/60 hover:bg-blue-900/60 text-xs font-bold text-gray-300 transition-colors"
                                >
                                    {floatingModal.secondaryButton.text}
                                </button>
                            ) : null}

                            {floatingModal.primaryButton ? (
                                <button
                                    type="button"
                                    onClick={floatingModal.primaryButton.onClick || closeFloatingModal}
                                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/50 transition-all"
                                >
                                    {floatingModal.primaryButton.text}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={closeFloatingModal}
                                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-950/50 transition-all"
                                >
                                    Tutup Window
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
