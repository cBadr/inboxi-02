import { NextRequest, NextResponse } from 'next/server';
import { verifyCoinPaymentsIpn } from '@inboxi/integrations/payments';
import { applyPaymentEvent } from '@/lib/payments';

// CoinPayments IPN handler. Verifies the HMAC over the raw body, then applies
// the event (activating a subscription on completion).
export async function POST(req: NextRequest) {
  const secret = process.env.COINPAYMENTS_IPN_SECRET;
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const rawBody = await req.text();
  const verdict = verifyCoinPaymentsIpn(rawBody, req.headers.get('hmac'), secret);
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
