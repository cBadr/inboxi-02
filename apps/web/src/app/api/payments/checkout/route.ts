import { NextRequest, NextResponse } from 'next/server';
import type { PaymentProviderType } from '@inboxi/db';
import { getCurrentUser } from '@/lib/session';
import { createCheckout } from '@/lib/payments';
import { getGatewayConfig } from '@/lib/payments-config';

const VALID: PaymentProviderType[] = ['COINPAYMENTS', 'BINANCE_PAY', 'NOWPAYMENTS'];

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { planId?: string; provider?: string };
  if (!body.planId) return NextResponse.json({ error: 'missing_plan' }, { status: 422 });

  const cfg = await getGatewayConfig();
  // Use the requested gateway only if valid + enabled, else fall back to default.
  const requested = VALID.find((p) => p === body.provider);
  const provider = requested && cfg.enabled[requested] ? requested : cfg.default;
  if (!cfg.enabled[provider]) {
    return NextResponse.json({ error: 'no_gateway_enabled' }, { status: 503 });
  }

  const result = await createCheckout(user.id, body.planId, provider);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
