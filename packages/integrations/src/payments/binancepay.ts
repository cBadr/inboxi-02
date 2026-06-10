import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookResult } from './types';

export interface BinanceWebhookHeaders {
  timestamp: string | null;
  nonce: string | null;
  signature: string | null;
}

// Binance Pay webhook verification: signature is HMAC-SHA512 (hex, uppercase)
// over `${timestamp}\n${nonce}\n${body}\n`, keyed by the merchant API secret.
export function verifyBinancePayWebhook(
  rawBody: string,
  headers: BinanceWebhookHeaders,
  apiSecret: string,
): WebhookResult {
  if (!headers.timestamp || !headers.nonce || !headers.signature) {
    return { valid: false, provider: 'BINANCE_PAY', error: 'missing_headers' };
  }
  const payload = `${headers.timestamp}\n${headers.nonce}\n${rawBody}\n`;
  const expected = createHmac('sha512', apiSecret).update(payload, 'utf8').digest('hex').toUpperCase();

  const a = Buffer.from(expected);
  const b = Buffer.from(headers.signature.toUpperCase());
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, provider: 'BINANCE_PAY', error: 'bad_signature' };
  }

  let parsed: { bizStatus?: string; merchantTradeNo?: string; data?: string } = {};
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { valid: false, provider: 'BINANCE_PAY', error: 'bad_json' };
  }

  // bizStatus: PAY_SUCCESS | PAY_CLOSED | ...
  const status =
    parsed.bizStatus === 'PAY_SUCCESS'
      ? 'COMPLETED'
      : parsed.bizStatus === 'PAY_CLOSED'
        ? 'EXPIRED'
        : 'PENDING';

  // merchantTradeNo is our order id; it may also be nested in data JSON.
  let orderId = parsed.merchantTradeNo;
  if (!orderId && parsed.data) {
    try {
      orderId = (JSON.parse(parsed.data) as { merchantTradeNo?: string }).merchantTradeNo;
    } catch {
      /* ignore */
    }
  }

  return { valid: true, provider: 'BINANCE_PAY', orderId, status };
}
