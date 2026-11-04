import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { verifyAdminAuth } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const isAuth = await verifyAdminAuth(req);
    if (!isAuth) {
        return NextResponse.json({ success: false, message: 'Unauthorized (Login admin kedaluwarsa)' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const user = body.smtp_user?.trim();
        const rawPass = body.smtp_pass || '';
        const pass = rawPass.replace(/\s+/g, '');
        const host = body.smtp_host?.trim() || 'smtp.gmail.com';
        const port = Number(body.smtp_port || 465);
        const fromName = body.smtp_from?.trim() || 'KENZIxCheat';

        if (!user || !pass) {
            return NextResponse.json({
                success: false,
                message: 'Silakan isi Email Pengirim dan Google App Password terlebih dahulu!'
            }, { status: 400 });
        }

        const isGmail = host.toLowerCase().includes('gmail.com');
        const transporter = isGmail
            ? nodemailer.createTransport({
                service: 'gmail',
                auth: { user, pass },
            })
            : nodemailer.createTransport({
                host,
                port,
                secure: port === 465,
                auth: { user, pass },
            });

        // Verifikasi kredensial ke server SMTP
        await transporter.verify();

        // Kirim email pengetesan ke email pengirim sendiri
        await transporter.sendMail({
            from: `"${fromName}" <${user}>`,
            to: user,
            subject: '✅ Tes SMTP Google Gmail Berhasil - KENZIxCheat',
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #090514; color: #f3e8ff; padding: 28px; border-radius: 14px; max-width: 550px; margin: 0 auto; border: 1px solid #7e22ce;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <span style="background: #ffb800; color: #ffffff; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">KENZIxCheat OFFICIAL</span>
                        <h2 style="color: #c084fc; margin: 12px 0 4px 0;">🎉 Koneksi SMTP Gmail Berhasil!</h2>
                        <p style="color: #a855f7; font-size: 13px; margin: 0;">Pengiriman Email Otomatis Siap Digunakan</p>
                    </div>
                    <div style="background: #150a2b; padding: 18px; border-radius: 10px; border: 1px solid #581c87; margin-bottom: 20px;">
                        <p style="margin: 0 0 10px 0; font-size: 13px; line-height: 1.6;">
                            Halo Admin! Akun Gmail <strong>${user}</strong> telah berhasil terhubung dengan sistem website <strong>${fromName}</strong>.
                        </p>
                        <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #4ade80;">
                            ✔ Setiap transaksi pembeli yang lunas akan otomatis menerima nota pembelian dan kode lisensi VIP secara instan ke email mereka.
                        </p>
                    </div>
                    <div style="text-align: center; font-size: 11px; color: #94a3b8;">
                        Dikirim otomatis oleh Sistem Toko KENZIxCheat • ${new Date().toLocaleString('id-ID')}
                    </div>
                </div>
            `,
        });

        return NextResponse.json({
            success: true,
            message: `Koneksi Berhasil! Email uji coba telah dikirim ke ${user}. Silakan cek inbox/spam Gmail Anda.`,
        });
    } catch (err: any) {
        console.error('[Test Email Error]:', err);
        let errorMsg = err.message || 'Gagal mengirim email';
        if (errorMsg.includes('Invalid login') || errorMsg.includes('535-5.7.8') || errorMsg.includes('Username and Password not accepted')) {
            errorMsg = 'Gagal Login ke Google: Pastikan Anda menggunakan Sandi Aplikasi (App Password) 16 karakter dari myaccount.google.com/apppasswords, bukan sandi akun Google biasa.';
        }
        return NextResponse.json({ success: false, message: errorMsg }, { status: 500 });
    }
}
