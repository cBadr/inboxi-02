import { NextRequest, NextResponse } from 'next/server';
import { applyPaymentEvent } from '@/lib/payments';

// DEV ONLY: simulate a completed crypto payment so the checkout → subscription
// flow can be exercised without provider credentials. Disabled in production.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'disabled' }, { status: 404 });
  }
  const paymentId = req.nextUrl.searchParams.get('paymentId');
  if (!paymentId) return NextResponse.json({ error: 'missing_payment' }, { status: 422 });

  await applyPaymentEvent({
    orderId: paymentId,
    providerRef: 'dev-simulated',
    status: 'COMPLETED',
  });
  // Send the user back to their subscription page.
  return NextResponse.redirect(new URL('/dashboard/subscription', req.url));
}
