import { NextResponse } from 'next/server';
import { verifyWebhookSignature, checkPaymentStatus } from '@/lib/wijayapay';
import { creditPaidTopup, findTopupByRef } from '@/lib/wallet';
import { markTopupStatus } from '@/lib/wallet';
import { findOrderByRef, markOrderExpired, settleOrderPayment } from '@/lib/checkout';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function parse(req: Request): Promise<any> {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) return req.json().catch(() => ({}));
    if (ct.includes('form')) {
        const f = await req.formData().catch(() => null);
        return f ? Object.fromEntries(f.entries()) : {};
    }
    const text = await req.text().catch(() => '');
    try { return JSON.parse(text); } catch { return Object.fromEntries(new URLSearchParams(text).entries()); }
}

/**
 * Webhook WijayaPay. Dua lapis pengaman sebelum saldo dikredit:
 *  (a) signature MD5 valid, ATAU (b) gateway mengonfirmasi lunas lewat API status (server-to-server).
 * Webhook palsu tanpa keduanya tidak akan menambah saldo.
 */
async function handle(refId: string, rawStatus: string, signature: string) {
    if (!refId) return NextResponse.json({ status: false, message: 'Missing ref_id' }, { status: 400 });
    if (signature && !(await verifyWebhookSignature(refId, signature))) {
        return NextResponse.json({ status: false, message: 'Invalid signature' }, { status: 401 });
    }
    const status = rawStatus.toLowerCase();
    const topup = await findTopupByRef(refId);
    if (!topup) {
        // Bukan top up → mungkin pembayaran produk langsung (ref ORD-…)
        const order = await findOrderByRef(refId);
        if (!order) return NextResponse.json({ status: true });
        if (status === 'paid') {
            let confirmed = Boolean(signature);
            if (!confirmed) {
                const s: any = await checkPaymentStatus(order.ref_id || refId);
                confirmed = !!(s && (s.status_pembayaran === 'paid' || s.status === 'paid' || s.data?.status === 'paid' || s.data?.status_pembayaran === 'paid'));
            }
            if (!confirmed) return NextResponse.json({ status: false, message: 'Unverified' }, { status: 401 });
            await settleOrderPayment(order.invoice_no);
        } else if (status === 'expired' || status === 'failed') {
            await markOrderExpired(order.invoice_no);
        }
        return NextResponse.json({ status: true });
    }

    if (status === 'paid') {
        let confirmed = Boolean(signature);
        if (!confirmed) {
            const s: any = await checkPaymentStatus(topup.payment_data?.ref_id || refId);
            confirmed = !!(s && (s.status_pembayaran === 'paid' || s.status === 'paid' || s.data?.status === 'paid' || s.data?.status_pembayaran === 'paid'));
        }
        if (!confirmed) return NextResponse.json({ status: false, message: 'Unverified' }, { status: 401 });
        await creditPaidTopup(topup.invoice_no);
    } else if (status === 'expired' || status === 'failed') {
        await markTopupStatus(topup.invoice_no, status === 'expired' ? 'EXPIRED' : 'FAILED');
    }
    return NextResponse.json({ status: true });
}

export async function POST(req: Request) {
    try {
        const body = await parse(req);
        const signature = req.headers.get('x-signature') || body.signature || body.x_signature || '';
        const status = String(body.status || body.status_pembayaran || body.data?.status || body.data?.status_pembayaran || '');
        const refId = String(body.data?.ref_id || body.ref_id || '');
        return await handle(refId, status, String(signature));
    } catch (e: any) {
        console.error('[Webhook WijayaPay Error]', e);
        return NextResponse.json({ status: false }, { status: 500 });
    }
}

export async function GET(req: Request) {
    const sp = new URL(req.url).searchParams;
    const refId = sp.get('ref_id');
    if (!refId) return NextResponse.json({ status: true, message: 'WijayaPay webhook aktif' });
    return handle(refId, sp.get('status') || sp.get('status_pembayaran') || '', sp.get('signature') || sp.get('x-signature') || '');
}
