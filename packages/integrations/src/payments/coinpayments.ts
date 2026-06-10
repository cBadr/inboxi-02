import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookResult } from './types';

// CoinPayments IPN verification: the `HMAC` header is HMAC-SHA512 of the raw
// urlencoded POST body, keyed by the merchant IPN secret.
export function verifyCoinPaymentsIpn(
  rawBody: string,
  hmacHeader: string | null,
  ipnSecret: string,
): WebhookResult {
  if (!hmacHeader) {
    return { valid: false, provider: 'COINPAYMENTS', error: 'missing_hmac' };
  }
  const expected = createHmac('sha512', ipnSecret).update(rawBody, 'utf8').digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hmacHeader, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, provider: 'COINPAYMENTS', error: 'bad_signature' };
  }

  const params = new URLSearchParams(rawBody);
  const statusNum = Number(params.get('status') ?? '0');
  // CoinPayments: >=100 or ==2 complete; <0 failed/cancelled; otherwise pending.
  const status =
    statusNum >= 100 || statusNum === 2 ? 'COMPLETED' : statusNum < 0 ? 'FAILED' : 'CONFIRMING';

  return {
    valid: true,
    provider: 'COINPAYMENTS',
    orderId: params.get('invoice') ?? params.get('item_number') ?? undefined,
    providerRef: params.get('txn_id') ?? undefined,
    status,
    amountUsd: params.get('amount1') ? Number(params.get('amount1')) : undefined,
  };
}
