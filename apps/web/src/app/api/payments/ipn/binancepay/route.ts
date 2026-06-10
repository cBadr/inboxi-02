import { NextRequest, NextResponse } from 'next/server';
import { verifyBinancePayWebhook } from '@inboxi/integrations/payments';
import { applyPaymentEvent } from '@/lib/payments';

export async function POST(req: NextRequest) {
  const secret = process.env.BINANCE_PAY_API_SECRET;
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const rawBody = await req.text();
  const verdict = verifyBinancePayWebhook(
    rawBody,
    {
      timestamp: req.headers.get('binancepay-timestamp'),
      nonce: req.headers.get('binancepay-nonce'),
      signature: req.headers.get('binancepay-signature'),
    },
    secret,
  );
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
