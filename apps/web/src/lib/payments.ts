import { prisma, PaymentProviderType, PaymentStatus, SubscriptionStatus } from '@inboxi/db';
import type { PaymentEventStatus } from '@inboxi/integrations/payments';

export interface CheckoutResult {
  ok: boolean;
  paymentId?: string;
  payUrl?: string;
  error?: string;
}

// Create a pending payment + checkout. Live provider checkout creation requires
// API credentials; without them (dev) we return a local simulate URL so the
// flow is testable end-to-end.
export async function createCheckout(
  userId: string,
  planId: string,
  provider: PaymentProviderType,
): Promise<CheckoutResult> {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || plan.isFree) return { ok: false, error: 'invalid_plan' };

  const payment = await prisma.payment.create({
    data: {
      userId,
      provider,
      status: PaymentStatus.PENDING,
      amountUsd: plan.priceUsd,
    },
  });

  // Live checkout creation would call the provider API here and store providerRef
  // + payUrl. In dev (no creds) we hand back a simulate URL.
  const hasCreds =
    provider === 'COINPAYMENTS'
      ? Boolean(process.env.COINPAYMENTS_PUBLIC_KEY)
      : Boolean(process.env.BINANCE_PAY_API_KEY);

  const payUrl = hasCreds
    ? undefined // set by real provider integration
    : `/api/payments/dev-complete?paymentId=${payment.id}`;

  return { ok: true, paymentId: payment.id, payUrl };
}

// Apply a verified webhook event to a payment, activating a subscription on
// completion. Idempotent — re-delivered webhooks are safe.
export async function applyPaymentEvent(args: {
  orderId: string;
  providerRef?: string;
  status: PaymentEventStatus;
  confirmations?: number;
}): Promise<{ ok: boolean; activated: boolean }> {
  const payment = await prisma.payment.findUnique({ where: { id: args.orderId } });
  if (!payment) return { ok: false, activated: false };

  if (payment.status === PaymentStatus.COMPLETED) {
    return { ok: true, activated: false }; // already processed
  }

  const statusMap: Record<PaymentEventStatus, PaymentStatus> = {
    PENDING: PaymentStatus.PENDING,
    CONFIRMING: PaymentStatus.CONFIRMING,
    COMPLETED: PaymentStatus.COMPLETED,
    FAILED: PaymentStatus.FAILED,
    EXPIRED: PaymentStatus.EXPIRED,
  };

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: statusMap[args.status],
      providerRef: args.providerRef ?? payment.providerRef,
      confirmations: args.confirmations ?? payment.confirmations,
    },
  });

  if (args.status !== 'COMPLETED') return { ok: true, activated: false };

  // Activate / extend the subscription for the plan matching this payment amount.
  const plan = await prisma.plan.findFirst({
    where: { priceUsd: payment.amountUsd, isActive: true, isFree: false },
    orderBy: { sortOrder: 'asc' },
  });
  if (!plan) return { ok: true, activated: false };

  const periodEnd = new Date(Date.now() + plan.billingPeriodDays * 86_400_000);
  const sub = await prisma.subscription.create({
    data: {
      userId: payment.userId,
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: periodEnd,
    },
  });
  await prisma.payment.update({ where: { id: payment.id }, data: { subscriptionId: sub.id } });

  return { ok: true, activated: true };
}
