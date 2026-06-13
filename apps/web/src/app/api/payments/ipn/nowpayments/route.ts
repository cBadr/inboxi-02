import { NextRequest, NextResponse } from 'next/server';
import { verifyNowPaymentsIpn } from '@inboxi/integrations/payments';
import { applyPaymentEvent } from '@/lib/payments';

// NowPayments IPN handler. Verifies the HMAC-SHA512 signature over the
// alphabetically-sorted JSON body, then applies the event (activating a
// subscription on completion).
export async function POST(req: NextRequest) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const rawBody = await req.text();
  const verdict = verifyNowPaymentsIpn(rawBody, req.headers.get('x-nowpayments-sig'), secret);
  if (!verdict.valid || !verdict.orderId || !verdict.status) {
    return NextResponse.json({ error: verdict.error ?? 'invalid' }, { status: 400 });
  }

  const result = await applyPaymentEvent({
    orderId: verdict.orderId,
    providerRef: verdict.providerRef,
    status: verdict.status,
  });
  return NextResponse.json(result);
}
