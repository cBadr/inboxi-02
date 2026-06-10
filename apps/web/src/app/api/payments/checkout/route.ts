import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { createCheckout } from '@/lib/payments';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { planId?: string; provider?: string };
  const provider = body.provider === 'BINANCE_PAY' ? 'BINANCE_PAY' : 'COINPAYMENTS';
  if (!body.planId) return NextResponse.json({ error: 'missing_plan' }, { status: 422 });

  const result = await createCheckout(user.id, body.planId, provider);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
