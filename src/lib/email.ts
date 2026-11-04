import nodemailer from 'nodemailer';
import { Order } from '@/lib/types';
import { getSiteSettings } from '@/lib/settings';

/**
 * Buat instance transporter Nodemailer Google Gmail SMTP atau Custom SMTP
 */
export async function getEmailTransporter() {
    try {
        const settings = await getSiteSettings();
        const user = settings.smtp_user || process.env.GMAIL_USER || process.env.SMTP_USER || '';
        const rawPass = settings.smtp_pass || process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '';
        const pass = rawPass.replace(/\s+/g, '');
        const host = settings.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com';
        const port = Number(settings.smtp_port || process.env.SMTP_PORT || 465);

        if (!user || !pass) {
            return null;
        }

        const isGmail = host.toLowerCase().includes('gmail.com') || !settings.smtp_host;

        const transporter = isGmail
            ? nodemailer.createTransport({
                service: 'gmail',
                auth: { user, pass },
                connectionTimeout: 8000,
                greetingTimeout: 8000,
                socketTimeout: 10000,
            })
            : nodemailer.createTransport({
                host,
                port,
                secure: port === 465,
                auth: { user, pass },
                connectionTimeout: 8000,
                greetingTimeout: 8000,
                socketTimeout: 10000,
            });

        const fromName = settings.site_name || 'KENZIxCheat';
        const fromAddress = settings.smtp_from || process.env.SMTP_FROM || `"${fromName}" <${user}>`;

        return {
            transporter,
            from: fromAddress.includes('@') ? fromAddress : `"${fromName}" <${user}>`,
            adminEmail: user,
            siteName: fromName,
        };
    } catch (err) {
        console.warn('[Email Transporter Warning]:', err);
        return null;
    }
}

/**
 * Kirim email invoice saat pesanan baru dibuat
 * Tema Ungu Cyberpunk VIP + Pengingat ID Transaksi
 */
export async function sendOrderCreatedEmail(order: Order, originUrl: string = ''): Promise<boolean> {
    if (!order.customer_email || !order.customer_email.includes('@')) {
        return false;
    }

    const orderUrl = `${originUrl || 'http://localhost:3000'}/order/${order.invoice_no}`;
    const trackUrl = `${originUrl || 'http://localhost:3000'}/lacak`;

    try {
        const config = await getEmailTransporter();
        if (!config) {
            console.log(`[Email Log] Pesanan Dibuat untuk ${order.customer_email} - ID Transaksi: ${order.invoice_no} (SMTP belum disetel, siap dikirim jika SMTP Google aktif).`);
            return true;
        }

        const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090514; color: #f3e8ff; padding: 28px; border-radius: 16px; max-width: 600px; margin: 0 auto; border: 1px solid #3b1d60; box-shadow: 0 10px 30px rgba(147, 51, 234, 0.15);">
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; background: linear-gradient(135deg, #7e22ce, #a855f7); padding: 6px 16px; border-radius: 9999px; margin-bottom: 10px;">
                    <span style="color: #ffffff; font-weight: 800; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase;">VIP STORE OFFICIAL</span>
                </div>
                <h1 style="background: linear-gradient(to right, #c084fc, #e879f9); -webkit-background-clip: text; color: #c084fc; margin: 0; font-size: 26px; font-weight: 900;">${config.siteName}</h1>
                <p style="color: #a855f7; font-size: 13px; margin-top: 4px; font-weight: 500;">Konfirmasi Pesanan & ID Transaksi Rahasia</p>
            </div>

            <div style="background-color: #150a2b; padding: 20px; border-radius: 12px; border: 1px solid #581c87; margin-bottom: 20px;">
                <p style="margin: 0 0 8px 0; font-size: 11px; color: #d8b4fe; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">ID Transaksi Anda (Gunakan ini untuk Lacak Pesanan):</p>
                <div style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 19px; font-weight: bold; color: #facc15; background: #0b0517; padding: 12px 16px; border-radius: 8px; border: 1px dashed #9333ea; letter-spacing: 0.5px;">
                    ${order.invoice_no}
                </div>
                <p style="font-size: 12px; color: #c084fc; margin: 10px 0 0 0; line-height: 1.5;">
                    🔒 <strong>Keamanan Lisensi:</strong> <em>Simpan ID Transaksi ini! Demi keamanan, sistem hanya mengizinkan pengecekan status dan lisensi melalui ID Transaksi, bukan alamat email.</em>
                </p>
            </div>

            <table style="width: 100%; font-size: 13px; border-collapse: collapse; margin-bottom: 24px; background: #130a24; border-radius: 10px; overflow: hidden; padding: 8px;">
                <tr>
                    <td style="color: #c4b5fd; padding: 10px 14px; border-bottom: 1px solid #2e1065;">Produk:</td>
                    <td style="text-align: right; font-weight: bold; color: #ffffff; padding: 10px 14px; border-bottom: 1px solid #2e1065;">${order.product_name}</td>
                </tr>
                <tr>
                    <td style="color: #c4b5fd; padding: 10px 14px; border-bottom: 1px solid #2e1065;">Item / Durasi:</td>
                    <td style="text-align: right; font-weight: bold; color: #c084fc; padding: 10px 14px; border-bottom: 1px solid #2e1065;">${order.item_name}</td>
                </tr>
                <tr>
                    <td style="color: #c4b5fd; padding: 10px 14px; border-bottom: 1px solid #2e1065;">Metode Pembayaran:</td>
                    <td style="text-align: right; color: #ffffff; padding: 10px 14px; border-bottom: 1px solid #2e1065;">${order.payment_name}</td>
                </tr>
                <tr>
                    <td style="color: #c4b5fd; padding: 10px 14px; border-bottom: 1px solid #2e1065;">Harga Produk:</td>
                    <td style="text-align: right; color: #ffffff; padding: 10px 14px; border-bottom: 1px solid #2e1065;">Rp ${Number(order.amount || (order.total_amount - (order.fee || 0))).toLocaleString('id-ID')}</td>
                </tr>
                ${order.fee && Number(order.fee) > 0 ? `
                <tr>
                    <td style="color: #c4b5fd; padding: 10px 14px; border-bottom: 1px solid #2e1065;">Biaya Layanan (Fee):</td>
                    <td style="text-align: right; color: #facc15; padding: 10px 14px; border-bottom: 1px solid #2e1065;">+ Rp ${Number(order.fee).toLocaleString('id-ID')}</td>
                </tr>` : ''}
                <tr>
                    <td style="color: #ffffff; font-weight: bold; padding: 12px 14px; font-size: 15px;">Total Tagihan:</td>
                    <td style="text-align: right; font-weight: 900; color: #38bdf8; font-size: 17px; padding: 12px 14px;">Rp ${Number(order.total_amount).toLocaleString('id-ID')}</td>
                </tr>
            </table>

            <div style="text-align: center; margin: 26px 0;">
                <a href="${orderUrl}" style="background: linear-gradient(135deg, #9333ea, #7e22ce); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: bold; display: inline-block; font-size: 14px; box-shadow: 0 4px 20px rgba(147, 51, 234, 0.4);">
                    Buka Halaman Pembayaran & Lisensi &rarr;
                </a>
            </div>

            <p style="font-size: 11px; color: #7c3aed; text-align: center; margin-top: 24px; border-top: 1px solid #2e1065; padding-top: 14px;">
                Jika tombol di atas tidak dapat diklik, salin tautan berikut ke browser: <br/>
                <a href="${orderUrl}" style="color: #c084fc; word-break: break-all;">${orderUrl}</a>
            </p>
        </div>
        `;

        await config.transporter.sendMail({
            from: config.from,
            to: order.customer_email,
            subject: `[ID Transaksi: ${order.invoice_no}] Pesanan Lisensi ${order.product_name}`,
            html,
        });

        console.log(`[Email Success] Email pesanan berhasil terkirim via Google SMTP ke ${order.customer_email}`);
        return true;
    } catch (error) {
        console.warn(`[Email Send Error]:`, error);
        return false;
    }
}

/**
 * Kirim email lisensi key saat pembayaran telah LUNAS (PAID)
 * Tema Ungu Cyberpunk VIP
 */
export async function sendOrderPaidEmail(order: Order, originUrl: string = ''): Promise<boolean> {
    const rawEmail = (order.customer_email || '').trim();
    const isRealCustomerEmail = rawEmail.includes('@') && !rawEmail.endsWith('@wa.order') && !rawEmail.endsWith('@customer.local');

    const config = await getEmailTransporter();
    if (!config) {
        console.log(`[Email Log] Pesanan Lunas ${order.invoice_no} (SMTP belum disetel).`);
        return false;
    }

    const targetRecipient = isRealCustomerEmail ? rawEmail : (config.adminEmail || '');
    if (!targetRecipient || !targetRecipient.includes('@')) {
        return false;
    }

    const licenseKey = order.delivery_data?.license_key || (order.delivery_data?.keys && order.delivery_data.keys[0]) || '-';
    const effectiveOrigin = originUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://kenzixxiter.my.id';
    const orderUrl = `${effectiveOrigin}/order/${order.invoice_no}`;

    try {
        const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090514; color: #f3e8ff; padding: 28px; border-radius: 16px; max-width: 600px; margin: 0 auto; border: 1px solid #10b981; box-shadow: 0 10px 35px rgba(16, 185, 129, 0.2);">
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; background: #065f46; border: 1px solid #10b981; padding: 4px 14px; border-radius: 9999px; margin-bottom: 10px;">
                    <span style="color: #34d399; font-weight: 800; font-size: 11px; letter-spacing: 1px; text-transform: uppercase;">TRANSAKSI LUNAS</span>
                </div>
                <h1 style="color: #10b981; margin: 0; font-size: 26px; font-weight: 900;">PEMBAYARAN BERHASIL!</h1>
                <p style="color: #c4b5fd; font-size: 13px; margin-top: 4px;">Lisensi VIP Anda Siap Digunakan</p>
            </div>

            <div style="background: linear-gradient(135deg, #1e0b38, #160829); padding: 22px; border-radius: 12px; border: 2px solid #a855f7; margin-bottom: 22px; text-align: center; box-shadow: 0 0 20px rgba(168, 85, 247, 0.25);">
                <p style="margin: 0 0 10px 0; font-size: 12px; color: #e9d5ff; text-transform: uppercase; font-weight: bold; letter-spacing: 1.5px;">KEY ANDA:</p>
                <div style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 22px; font-weight: 900; color: #fde047; background: #080312; padding: 14px 18px; border-radius: 10px; border: 1px dashed #c084fc; letter-spacing: 1.5px; word-break: break-all;">
                    ${licenseKey}
                </div>
            </div>

            <table style="width: 100%; font-size: 13px; border-collapse: collapse; margin-bottom: 22px; background: #130a24; border-radius: 10px; overflow: hidden;">
                <tr>
                    <td style="color: #c4b5fd; padding: 10px 14px; border-bottom: 1px solid #2e1065;">ID Transaksi:</td>
                    <td style="text-align: right; font-family: monospace; font-weight: bold; color: #facc15; padding: 10px 14px; border-bottom: 1px solid #2e1065;">${order.invoice_no}</td>
                </tr>
                <tr>
                    <td style="color: #c4b5fd; padding: 10px 14px; border-bottom: 1px solid #2e1065;">Produk:</td>
                    <td style="text-align: right; font-weight: bold; color: #ffffff; padding: 10px 14px; border-bottom: 1px solid #2e1065;">${order.product_name}</td>
                </tr>
                <tr>
                    <td style="color: #c4b5fd; padding: 10px 14px; border-bottom: 1px solid #2e1065;">Item / Durasi:</td>
                    <td style="text-align: right; font-weight: bold; color: #c084fc; padding: 10px 14px; border-bottom: 1px solid #2e1065;">${order.item_name}</td>
                </tr>
                <tr>
                    <td style="color: #ffffff; font-weight: bold; padding: 12px 14px; font-size: 14px;">Status:</td>
                    <td style="text-align: right; font-weight: 900; color: #10b981; font-size: 14px; padding: 12px 14px;">LUNAS</td>
                </tr>
            </table>

            <div style="text-align: center; margin: 26px 0;">
                <a href="${orderUrl}" style="background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: bold; display: inline-block; font-size: 14px; box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);">
                    Buka Detail & Download Lisensi &rarr;
                </a>
            </div>

            <p style="font-size: 11px; color: #7c3aed; text-align: center; margin-top: 24px; border-top: 1px solid #2e1065; padding-top: 14px;">
                🔒 <strong>Keamanan:</strong> Kode lisensi ini disimpan permanen dan hanya dapat dicek kapan pun melalui ID Transaksi: <strong>${order.invoice_no}</strong> di menu Cek Transaksi.
            </p>
        </div>
        `;

        const mailOptions: any = {
            from: config.from,
            to: targetRecipient,
            subject: isRealCustomerEmail
                ? `[LISENSI VIP AKTIF] ${order.product_name} - ${order.invoice_no}`
                : `[NOTIFIKASI TRANSAKSI LUNAS] ${order.product_name} - ${order.invoice_no}`,
            html,
        };

        if (isRealCustomerEmail && config.adminEmail && config.adminEmail !== targetRecipient) {
            mailOptions.bcc = config.adminEmail;
        }

        await config.transporter.sendMail(mailOptions);

        console.log(`[Email Success] Email lisensi berhasil terkirim via Google SMTP ke ${targetRecipient}`);
        return true;
    } catch (error) {
        console.warn(`[Email Send Error]:`, error);
        return false;
    }
}

/** Kirim email generik (dipakai untuk reset password admin). Return false bila SMTP belum diatur. */
export async function sendPlainMail(to: string, subject: string, html: string): Promise<boolean> {
    try {
        const t = await getEmailTransporter();
        if (!t) return false;
        await t.transporter.sendMail({ from: t.from, to, subject, html });
        return true;
    } catch (e) {
        console.warn('[sendPlainMail] gagal:', e);
        return false;
    }
}
