import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CheckoutInput, CheckoutResult, WebhookResult } from './types';

const API_BASE = 'https://api.nowpayments.io/v1';

export interface NowPaymentsOptions {
  apiKey: string;
  ipnCallbackUrl?: string;
  fetchImpl?: typeof fetch;
}

// Create a hosted NowPayments invoice and return its checkout URL. NowPayments
// exposes a real hosted page, so unlike the other providers this gives a usable
// payUrl immediately.
export async function createNowPaymentsInvoice(
  input: CheckoutInput,
  opts: NowPaymentsOptions,
): Promise<CheckoutResult> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(`${API_BASE}/invoice`, {
    method: 'POST',
    headers: { 'x-api-key': opts.apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      price_amount: input.amountUsd,
      price_currency: 'usd',
      order_id: input.orderId,
      order_description: input.itemName,
      ipn_callback_url: opts.ipnCallbackUrl,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; invoice_url?: string };
  if (!res.ok || !data.invoice_url) {
    throw new Error(`NowPayments invoice failed: ${res.status}`);
  }
  return {
    provider: 'NOWPAYMENTS',
    providerRef: String(data.id ?? ''),
    payUrl: data.invoice_url,
    raw: data,
  };
}

// NowPayments signs IPNs with HMAC-SHA512 over the JSON body with keys sorted
// alphabetically (recursively), keyed by the IPN secret. Header: x-nowpayments-sig.
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

const STATUS_MAP: Record<string, WebhookResult['status']> = {
  waiting: 'PENDING',
  confirming: 'CONFIRMING',
  confirmed: 'CONFIRMING',
  sending: 'CONFIRMING',
  partially_paid: 'CONFIRMING',
  finished: 'COMPLETED',
  failed: 'FAILED',
  refunded: 'FAILED',
  expired: 'EXPIRED',
};

export function verifyNowPaymentsIpn(
  rawBody: string,
  sigHeader: string | null,
  ipnSecret: string,
): WebhookResult {
  if (!sigHeader) return { valid: false, provider: 'NOWPAYMENTS', error: 'missing_signature' };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { valid: false, provider: 'NOWPAYMENTS', error: 'bad_json' };
  }

  const sorted = JSON.stringify(sortDeep(parsed));
  const expected = createHmac('sha512', ipnSecret).update(sorted, 'utf8').digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(sigHeader);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, provider: 'NOWPAYMENTS', error: 'bad_signature' };
  }

  const payStatus = String(parsed.payment_status ?? '').toLowerCase();
  return {
    valid: true,
    provider: 'NOWPAYMENTS',
    orderId: parsed.order_id ? String(parsed.order_id) : undefined,
    providerRef: parsed.payment_id ? String(parsed.payment_id) : undefined,
    status: STATUS_MAP[payStatus] ?? 'CONFIRMING',
    amountUsd: parsed.price_amount ? Number(parsed.price_amount) : undefined,
  };
}
