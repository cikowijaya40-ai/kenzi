import crypto from 'crypto';
import axios from 'axios';
import { INITIAL_PAYMENT_METHODS } from './data';
import { PaymentMethod } from './types';
import { getSiteSettings } from './settings';

export interface WijayapayProxyConfig {
    protocol: string;
    host: string;
    port: number;
    auth: {
        username: string;
        password: string;
    };
}

export async function getWijayapayConfig() {
    let settings: any = {};
    try {
        settings = await getSiteSettings();
    } catch {
        settings = {};
    }

    const merchantCode = settings.wijayapay_merchant_code || process.env.WIJAYAPAY_MERCHANT_CODE || '';
    const apiKey = settings.wijayapay_api_key || process.env.WIJAYAPAY_API_KEY || '';
    const baseUrl = settings.wijayapay_base_url || process.env.WIJAYAPAY_BASE_URL || 'https://gateway.wijayapay.com';

    // Konfigurasi Proxy Dedicated IP Whitelist (103.253.244.66)
    const proxyEnabled = settings.wijayapay_proxy_enabled === true;
    const proxyHost = settings.wijayapay_proxy_host || process.env.WIJAYAPAY_PROXY_HOST || '';
    const proxyPort = Number(settings.wijayapay_proxy_port || process.env.WIJAYAPAY_PROXY_PORT || 3128);
    const proxyUser = settings.wijayapay_proxy_user || process.env.WIJAYAPAY_PROXY_USER || '';
    const proxyPass = settings.wijayapay_proxy_pass || process.env.WIJAYAPAY_PROXY_PASS || '';

    const proxy: WijayapayProxyConfig | undefined = proxyEnabled
        ? {
            protocol: 'http',
            host: proxyHost,
            port: proxyPort,
            auth: {
                username: proxyUser,
                password: proxyPass,
            },
        }
        : undefined;

    return {
        merchantCode,
        apiKey,
        baseUrl,
        proxy,
        proxyEnabled,
    };
}

/**
 * Buat X-Signature MD5 sesuai dokumentasi:
 * md5(code_merchant + api_key + ref_id)
 */
export async function generateSignature(refId: string): Promise<string> {
    const config = await getWijayapayConfig();
    const payload = `${config.merchantCode}${config.apiKey}${refId}`;
    return crypto.createHash('md5').update(payload).digest('hex');
}

/**
 * Validasi signature dari webhook Wijayapay
 */
export async function verifyWebhookSignature(refId: string, receivedSignature: string): Promise<boolean> {
    const expected = await generateSignature(refId);
    return expected.toLowerCase() === (receivedSignature || '').toLowerCase();
}

/**
 * Ambil daftar channel pembayaran aktif dari Wijayapay
 */
export async function getPaymentChannels(): Promise<PaymentMethod[]> {
    const config = await getWijayapayConfig();
    try {
        const response = await axios.get(`${config.baseUrl}/api/get-payment`, {
            params: {
                code_merchant: config.merchantCode,
                api_key: config.apiKey,
            },
            proxy: config.proxy,
            headers: {
                'User-Agent': 'EpepTopupStore/1.0',
            },
            timeout: 10000,
        });

        const json = response.data;
        if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
            return json.data
                .filter((item: any) => item.status === 'active')
                .map((item: any) => ({
                    id: `pm-${item.code.toLowerCase()}`,
                    code: item.code,
                    name: item.name,
                    group_name: item.group || 'Virtual Account',
                    image_url: item.image,
                    fee_amount: parseFloat(item.fee_amount || 0),
                    fee_percent: parseFloat(item.fee_percent || 0),
                    min_trx: parseFloat(item.min_trx || 1000),
                    max_trx: parseFloat(item.max_trx || 10000000),
                    type_fee: item.type_fee || 'customer',
                    tutorial_pembayaran: item.tutorial_pembayaran,
                    is_active: item.status === 'active',
                    status: item.status,
                }));
        }
    } catch (error: any) {
        console.warn('Gagal mengambil channel dari Wijayapay via proxy:', error?.message || error);
    }

    // Fallback ke data offline yang valid dari dokumentasi
    return INITIAL_PAYMENT_METHODS;
}

/**
 * Buat transaksi pembayaran ke Wijayapay
 */
export async function createPaymentTransaction({
    ref_id,
    code_payment,
    nominal,
}: {
    ref_id: string;
    code_payment: string;
    nominal: number;
}) {
    const config = await getWijayapayConfig();
    const signature = await generateSignature(ref_id);

    try {
        const formData = new URLSearchParams();
        formData.append('code_merchant', config.merchantCode);
        formData.append('api_key', config.apiKey);
        formData.append('ref_id', ref_id);
        formData.append('code_payment', code_payment);
        formData.append('nominal', nominal.toString());

        const response = await axios.post(`${config.baseUrl}/api/transaction/create`, formData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'EpepTopupStore/1.0',
                'X-Signature': signature,
            },
            proxy: config.proxy,
            timeout: 15000,
        });

        const result = response.data;

        if (result && result.success && result.data) {
            return {
                success: true,
                data: result.data,
            };
        } else {
            console.warn('Wijayapay create error response:', result);
            return {
                success: false,
                message: result?.message || 'Gagal generate pembayaran dari WijayaPay',
                raw: result,
            };
        }
    } catch (error: any) {
        const errorData = error.response?.data;
        console.warn('Koneksi ke Wijayapay gagal:', errorData || error?.message || error);
        return {
            success: false,
            message: errorData?.message || `Koneksi ke gateway WijayaPay gagal: ${error?.message || error}`,
            raw: errorData,
        };
    }
}

/**
 * Cek status pembayaran ke Wijayapay
 */
export async function checkPaymentStatus(ref_id: string) {
    const config = await getWijayapayConfig();
    try {
        const response = await axios.get(`${config.baseUrl}/api/get-status`, {
            params: {
                code_merchant: config.merchantCode,
                api_key: config.apiKey,
                ref_id,
            },
            proxy: config.proxy,
            headers: {
                'User-Agent': 'EpepTopupStore/1.0',
            },
            timeout: 10000,
        });

        if (response.data) {
            return response.data;
        }
    } catch (error: any) {
        console.warn('Gagal cek status dari Wijayapay:', error.response?.data || error.message);
    }

    return null;
}

/**
 * Mock payment generator untuk fallback aman (offline/demo)
 */
function createMockPaymentResponse(ref_id: string, code_payment: string, nominal: number) {
    const expiryDate = new Date(Date.now() + 15 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

    if (code_payment === 'QRIS') {
        const qrPayload = `00020101021226640017ID.CO.WIJAYAPAY.WWW011893600918000000010215${ref_id}5802ID5303360540${nominal}5802ID`;
        return {
            success: true,
            data: {
                payment_name: 'QRIS',
                payment_method: 'QRIS',
                payment_image: 'https://wijayapay.com/storage/logo/payment/qris.png',
                total_bayar: nominal,
                total_fee: 0,
                total_diterima: nominal,
                ref_id: ref_id,
                trx_reference: `WPTRX${Math.floor(100000 + Math.random() * 900000)}`,
                expired: expiryDate,
                tutorial_pembayaran: 'Buka aplikasi DANA / GoPay / OVO / ShopeePay / BCA Mobile lalu scan QRIS di layar.',
                qr_string: qrPayload,
                qr_image: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrPayload)}`,
            },
        };
    } else if (code_payment.includes('VA')) {
        const bankPrefix: Record<string, string> = {
            BCAVA: '1551',
            BRIVA: '8881',
            BNIVA: '8277',
            MANDIRIVA: '8782',
            BANKNEOVA: '9001',
        };
        const prefix = bankPrefix[code_payment] || '8821';
        const vaNumber = `${prefix}${Math.floor(1000000000 + Math.random() * 9000000000)}`;

        return {
            success: true,
            data: {
                payment_name: `${code_payment.replace('VA', '')} Virtual Account`,
                payment_method: code_payment,
                payment_image: `https://wijayapay.com/storage/logo/payment/logo-${code_payment.toLowerCase().replace('va', '')}.png`,
                total_bayar: nominal,
                total_fee: 0,
                total_diterima: nominal,
                ref_id: ref_id,
                trx_reference: `WPTRX${Math.floor(100000 + Math.random() * 900000)}`,
                expired: expiryDate,
                nomor_va: vaNumber,
                tutorial_pembayaran: `Transfer ke nomor Virtual Account ${vaNumber} via m-Banking atau ATM.`,
            },
        };
    } else {
        // Retail
        const retailCode = `2116${Math.floor(1000000000 + Math.random() * 9000000000)}`;
        return {
            success: true,
            data: {
                payment_name: code_payment === 'ALFAMART' ? 'Alfamart Retail' : 'Indomaret Retail',
                payment_method: code_payment,
                payment_image: code_payment === 'ALFAMART'
                    ? 'https://wijayapay.com/storage/logo/payment/ALFAMART_LOGO_BARU.png'
                    : 'https://wijayapay.com/storage/logo/payment/Logo_Indomaret.png',
                total_bayar: nominal,
                total_fee: 0,
                total_diterima: nominal,
                ref_id: ref_id,
                trx_reference: `WPTRX${Math.floor(100000 + Math.random() * 900000)}`,
                expired: expiryDate,
                nomor_pembayaran: retailCode,
                tutorial_pembayaran: `Tunjukkan kode pembayaran ${retailCode} kepada kasir untuk pembayaran LINKITA.`,
            },
        };
    }
}
