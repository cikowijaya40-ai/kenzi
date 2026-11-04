import { NextResponse } from 'next/server';
import { getAllOrders, updateOrder, deleteOrder, getOrder } from '@/lib/supabase';
import { orderLicenseKey } from '@/lib/thanhub';
import { verifyAdminAuth } from '@/lib/security';
import { checkPaymentStatus } from '@/lib/wijayapay';
import { checkAutogopayStatus } from '@/lib/autogopay';
import { sendOrderPaidEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const isAuth = await verifyAdminAuth(req);
    if (!isAuth) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const orders = await getAllOrders();
        return NextResponse.json({ success: true, data: orders });
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const isAuth = await verifyAdminAuth(req);
    if (!isAuth) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { action, identifier } = body;

        // ---------------------------------------------------------
        // AKSI: CEK SEMUA PEMBAYARAN PENDING (MASSAL)
        // ---------------------------------------------------------
        if (action === 'check_all_pending') {
            const allOrders = await getAllOrders();
            const pendingOrders = allOrders.filter(o => o.status === 'PENDING');
            let newlyPaid = 0;
            const details: any[] = [];

            for (const ord of pendingOrders) {
                let isPaid = false;
                let pgStatus: any = null;
                if (ord.payment_data?.gateway_provider === 'autogopay') {
                    try {
                        pgStatus = await checkAutogopayStatus(ord.invoice_no);
                        if (pgStatus?.status === 'paid') {
                            isPaid = true;
                        } else if (pgStatus && (pgStatus.status === 'expired' || pgStatus.status === 'cancelled')) {
                            await updateOrder(ord.ref_id, { status: 'EXPIRED' });
                        }
                    } catch (e) { }
                } else {
                    try {
                        pgStatus = await checkPaymentStatus(ord.ref_id);
                        if (
                            pgStatus && (
                                pgStatus.status_pembayaran === 'paid' ||
                                pgStatus.status === 'paid' ||
                                pgStatus.data?.status === 'paid' ||
                                pgStatus.data?.status_pembayaran === 'paid'
                            )
                        ) {
                            isPaid = true;
                        }
                    } catch (e) { }
                }

                if (isPaid) {
                    try {
                        let licenseKey = ord.delivery_data?.license_key;
                        let keys = ord.delivery_data?.keys;
                        let deliveryError = '';
                        if (!licenseKey) {
                            const keyResult = await orderLicenseKey(ord.item_sku, { androidId: ord.user_id_game || undefined, ref: ord.invoice_no });
                            licenseKey = keyResult.keys?.[0];
                            keys = keyResult.keys;
                            // Tidak ada lagi key palsu: bila Thanhub gagal, pesanan tetap LUNAS tapi pengiriman ditandai PENDING
                            if (!licenseKey) deliveryError = keyResult.error || 'Provider lisensi belum siap';
                        }

                        const updated = await updateOrder(ord.ref_id, deliveryError ? {
                            status: 'PAID',
                            delivery_status: 'PENDING',
                            delivery_data: {
                                ...ord.delivery_data,
                                message: `Lunas, tapi lisensi belum terkirim: ${deliveryError}. Gunakan "Generate Ulang Lisensi" setelah masalah provider beres.`,
                            },
                        } : {
                            status: 'PAID',
                            delivery_status: 'DELIVERED',
                            delivery_data: {
                                ...ord.delivery_data,
                                license_key: licenseKey,
                                keys,
                                delivered_at: new Date().toISOString(),
                                message: 'Pembayaran sukses terverifikasi otomatis via Cek Pembayaran!',
                            },
                        });

                        if (updated?.customer_email && !deliveryError) {
                            sendOrderPaidEmail(updated).catch(() => { });
                        }

                        newlyPaid++;
                        details.push({
                            invoice_no: ord.invoice_no,
                            ref_id: ord.ref_id,
                            product_name: ord.product_name,
                            total_amount: ord.total_amount,
                            isPaid: true,
                            licenseKey,
                            status: 'PAID',
                            message: deliveryError ? `LUNAS, tapi lisensi belum terkirim: ${deliveryError}` : 'LUNAS (Terverifikasi Gateway)',
                        });
                    } catch (err: any) {
                        details.push({
                            invoice_no: ord.invoice_no,
                            ref_id: ord.ref_id,
                            product_name: ord.product_name,
                            total_amount: ord.total_amount,
                            isPaid: false,
                            status: 'PENDING',
                            message: `Error aktivasi lisensi: ${err.message}`,
                        });
                    }
                } else {
                    details.push({
                        invoice_no: ord.invoice_no,
                        ref_id: ord.ref_id,
                        product_name: ord.product_name,
                        total_amount: ord.total_amount,
                        isPaid: false,
                        status: 'PENDING',
                        message: 'Belum Terdeteksi (Belum ada dana masuk)',
                    });
                }
            }

            const updatedOrders = await getAllOrders();
            return NextResponse.json({
                success: true,
                message: `Pengecekan selesai! ${pendingOrders.length} pesanan pending diperiksa. ${newlyPaid} terdeteksi LUNAS, ${pendingOrders.length - newlyPaid} belum terdeteksi.`,
                totalChecked: pendingOrders.length,
                newlyPaidCount: newlyPaid,
                stillPendingCount: pendingOrders.length - newlyPaid,
                details,
                data: updatedOrders,
            });
        }

        if (!identifier) {
            return NextResponse.json({ success: false, message: 'Identifier (Invoice / Ref ID) diperlukan' }, { status: 400 });
        }

        const existing = await getOrder(identifier);
        if (!existing) {
            return NextResponse.json({ success: false, message: 'Pesanan tidak ditemukan' }, { status: 404 });
        }

        // ---------------------------------------------------------
        // AKSI: CEK PEMBAYARAN SATUAN (SINGLE)
        // ---------------------------------------------------------
        if (action === 'check_payment') {
            if (existing.status === 'PAID') {
                return NextResponse.json({
                    success: true,
                    isPaid: true,
                    alreadyPaid: true,
                    message: `Pesanan ${existing.invoice_no} sudah berstatus LUNAS. Lisensi: ${existing.delivery_data?.license_key || '-'}`,
                    data: existing,
                });
            }

            let isPaid = false;
            let pgStatus: any = null;
            try {
                if (existing.payment_data?.gateway_provider === 'autogopay') {
                    pgStatus = await checkAutogopayStatus(existing.invoice_no);
                    if (pgStatus?.status === 'paid') {
                        isPaid = true;
                    } else if (pgStatus && (pgStatus.status === 'expired' || pgStatus.status === 'cancelled')) {
                        await updateOrder(existing.ref_id, { status: 'EXPIRED' });
                    }
                } else {
                    pgStatus = await checkPaymentStatus(existing.ref_id);
                    if (
                        pgStatus && (
                            pgStatus.status_pembayaran === 'paid' ||
                            pgStatus.status === 'paid' ||
                            pgStatus.data?.status === 'paid' ||
                            pgStatus.data?.status_pembayaran === 'paid'
                        )
                    ) {
                        isPaid = true;
                    }
                }
            } catch (err: any) {
                console.warn('[Admin Check Payment Error]:', err);
            }

            if (isPaid) {
                let licenseKey = existing.delivery_data?.license_key;
                let keys = existing.delivery_data?.keys;
                let deliveryError = '';
                if (!licenseKey) {
                    const keyResult = await orderLicenseKey(existing.item_sku, { androidId: existing.user_id_game || undefined, ref: existing.invoice_no });
                    licenseKey = keyResult.keys?.[0];
                    keys = keyResult.keys;
                    if (!licenseKey) deliveryError = keyResult.error || 'Provider lisensi belum siap';
                }

                const updated = await updateOrder(existing.ref_id, deliveryError ? {
                    status: 'PAID',
                    delivery_status: 'PENDING',
                    delivery_data: {
                        ...existing.delivery_data,
                        message: `Lunas, tapi lisensi belum terkirim: ${deliveryError}. Gunakan "Generate Ulang Lisensi" setelah masalah provider beres.`,
                    },
                } : {
                    status: 'PAID',
                    delivery_status: 'DELIVERED',
                    delivery_data: {
                        ...existing.delivery_data,
                        license_key: licenseKey,
                        keys,
                        delivered_at: new Date().toISOString(),
                        message: 'Pembayaran sukses terverifikasi via Cek Pembayaran!',
                    },
                });

                if (updated?.customer_email && !deliveryError) {
                    sendOrderPaidEmail(updated).catch(() => { });
                }

                return NextResponse.json({
                    success: true,
                    isPaid: true,
                    message: deliveryError
                        ? `Pembayaran ${existing.invoice_no} TERDETEKSI (LUNAS), tetapi lisensi belum terkirim: ${deliveryError}`
                        : `Pembayaran untuk ${existing.invoice_no} BERHASIL TERDETEKSI (LUNAS)! Lisensi otomatis diterbitkan & disimpan ke database.`,
                    licenseKey,
                    data: updated,
                    pgStatus,
                });
            } else {
                return NextResponse.json({
                    success: true,
                    isPaid: false,
                    message: `Pembayaran untuk invoice ${existing.invoice_no} BELUM TERDETEKSI di gateway ${existing.payment_data?.gateway_provider === 'autogopay' ? 'AutoGopay' : 'Wijayapay / Mutasi Bank'}.`,
                    data: existing,
                    pgStatus,
                });
            }
        }

        if (action === 'mark_paid') {
            // Generate license jika belum ada
            let licenseKey = existing.delivery_data?.license_key;
            let keys = existing.delivery_data?.keys;

            if (!licenseKey) {
                const keyResult = await orderLicenseKey(existing.item_sku, { androidId: existing.user_id_game || undefined, ref: existing.invoice_no });
                licenseKey = keyResult.keys?.[0];
                keys = keyResult.keys;
                if (!licenseKey) {
                    return NextResponse.json({ success: false, message: `Gagal menerbitkan lisensi dari Thanhub: ${keyResult.error || 'provider belum siap'}. Status pesanan tidak diubah.` }, { status: 502 });
                }
            }

            const updated = await updateOrder(existing.ref_id, {
                status: 'PAID',
                delivery_status: 'DELIVERED',
                delivery_data: {
                    ...existing.delivery_data,
                    license_key: licenseKey,
                    keys: keys,
                    manual_approved: true,
                    approved_at: new Date().toISOString(),
                },
            });

            return NextResponse.json({ success: true, message: 'Status pesanan berhasil diubah menjadi LUNAS & lisensi terkirim', data: updated });
        } else if (action === 'regen_license') {
            const keyResult = await orderLicenseKey(existing.item_sku, { androidId: existing.user_id_game || undefined, ref: existing.invoice_no });
            const licenseKey = keyResult.keys?.[0];
            if (!licenseKey) {
                return NextResponse.json({ success: false, message: `Gagal generate lisensi dari Thanhub: ${keyResult.error || 'provider belum siap'}` }, { status: 502 });
            }

            const updated = await updateOrder(existing.ref_id, {
                delivery_status: 'DELIVERED',
                delivery_data: {
                    ...existing.delivery_data,
                    license_key: licenseKey,
                    keys: keyResult.keys,
                    regen_at: new Date().toISOString(),
                },
            });

            return NextResponse.json({ success: true, message: 'Lisensi baru berhasil di-generate', data: updated });
        }

        return NextResponse.json({ success: false, message: 'Action tidak dikenal' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    const isAuth = await verifyAdminAuth(req);
    if (!isAuth) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const identifier = searchParams.get('identifier');

        if (!identifier) {
            return NextResponse.json({ success: false, message: 'Identifier diperlukan' }, { status: 400 });
        }

        const ok = await deleteOrder(identifier);
        return NextResponse.json({ success: ok, message: ok ? 'Pesanan berhasil dihapus' : 'Gagal menghapus pesanan' });
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
