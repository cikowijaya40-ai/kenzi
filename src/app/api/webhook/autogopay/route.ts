import { NextResponse } from 'next/server';
import { verifyAutogopayWebhookSignature, getAutogopayConfig } from '@/lib/autogopay';
import { creditPaidTopup, findTopupByRef } from '@/lib/wallet';
import { markTopupStatus } from '@/lib/wallet';
import { isOrderRef, markOrderExpired, settleOrderPayment } from '@/lib/checkout';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Webhook AutoGopay: signature HMAC-SHA256 wajib valid, nominal harus cocok dengan tagihan. */
export async function POST(req: Request) {
    try {
        const rawBody = await req.text();
        let body: any = {};
        try { body = JSON.parse(rawBody); } catch { body = {}; }

        const config = await getAutogopayConfig();
        if (!config.webhookSecret || typeof body?.signature !== 'string' || !body.signature ||
            !verifyAutogopayWebhookSignature({ rawBody, body, secret: config.webhookSecret })) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const reference = body.reference;
        const status = String(body.status || '').toLowerCase();
        if (!reference || typeof reference !== 'string') return new NextResponse('OK', { status: 200 });

        // Pembayaran produk langsung (INV-…) vs top up saldo (TOP-…)
        if (isOrderRef(reference)) {
            if (status === 'success') {
                const out = await settleOrderPayment(reference, body.amount ?? null);
                console.log(`[Webhook AutoGopay] order ${reference} → ${out}`);
            } else if (status === 'failed' || status === 'expired') {
                await markOrderExpired(reference);
            }
            return new NextResponse('OK', { status: 200 });
        }

        if (status === 'success') {
            const out = await creditPaidTopup(reference, body.amount ?? null);
            console.log(`[Webhook AutoGopay] ${reference} → ${out}`);
        } else if (status === 'failed' || status === 'expired') {
            const t = await findTopupByRef(reference);
            if (t) await markTopupStatus(t.invoice_no, status === 'expired' ? 'EXPIRED' : 'FAILED');
        }
        return new NextResponse('OK', { status: 200 });
    } catch (e) {
        console.error('[Webhook AutoGopay Error]', e);
        return new NextResponse('OK', { status: 200 });
    }
}

export async function GET() {
    return NextResponse.json({ success: true, message: 'Webhook AutoGopay aktif.' });
}
