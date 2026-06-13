import { prisma, PaymentProviderType, PaymentStatus, SubscriptionStatus } from '@inboxi/db';
import { type PaymentEventStatus, createNowPaymentsInvoice } from '@inboxi/integrations/payments';
import { isGatewayConfigured, getGatewayCredentials } from './payments-config';

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

  // Without live credentials, hand back a local simulate URL so the flow stays
  // testable end-to-end.
  if (!(await isGatewayConfigured(provider))) {
    return {
      ok: true,
      paymentId: payment.id,
      payUrl: `/api/payments/dev-complete?paymentId=${payment.id}`,
    };
  }

  // Absolute base URL for callbacks (NowPayments rejects relative URLs).
  const base = (process.env.APP_URL ?? '').replace(/\/$/, '');
  const abs = /^https?:\/\//.test(base) ? base : '';

  // NowPayments has a real hosted invoice — create it and return its URL.
  if (provider === 'NOWPAYMENTS') {
    try {
      const creds = await getGatewayCredentials('NOWPAYMENTS');
      if (!creds.apiKey) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });
        return { ok: false, error: 'NowPayments API key is not configured (Admin → Payments).' };
      }
      const invoice = await createNowPaymentsInvoice(
        {
          amountUsd: Number(plan.priceUsd),
          orderId: payment.id,
          itemName: `${plan.name} subscription`,
          successUrl: abs ? `${abs}/dashboard/subscription?paid=1` : undefined,
          cancelUrl: abs ? `${abs}/pricing` : undefined,
        },
        {
          apiKey: creds.apiKey,
          ipnCallbackUrl: abs ? `${abs}/api/payments/ipn/nowpayments` : undefined,
        },
      );
      await prisma.payment.update({
        where: { id: payment.id },
        data: { providerRef: invoice.providerRef },
      });
      return { ok: true, paymentId: payment.id, payUrl: invoice.payUrl };
    } catch (err) {
      console.error('[payments] NowPayments checkout failed:', err);
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      return { ok: false, error: err instanceof Error ? err.message.slice(0, 180) : 'gateway_error' };
    }
  }

  // CoinPayments / Binance Pay hosted-checkout creation is provider-specific and
  // not yet wired; their IPN/webhook verification is already in place.
  return { ok: true, paymentId: payment.id };
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
