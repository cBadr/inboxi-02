import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyCoinPaymentsIpn } from '../coinpayments';
import { verifyBinancePayWebhook } from '../binancepay';

describe('verifyCoinPaymentsIpn', () => {
  const secret = 'ipn_secret';
  const body = 'invoice=pay_123&txn_id=TX9&status=100&amount1=9.99';
  const goodHmac = createHmac('sha512', secret).update(body, 'utf8').digest('hex');

  it('accepts a correctly signed COMPLETED IPN', () => {
    const r = verifyCoinPaymentsIpn(body, goodHmac, secret);
    expect(r.valid).toBe(true);
    expect(r.status).toBe('COMPLETED');
    expect(r.orderId).toBe('pay_123');
    expect(r.amountUsd).toBe(9.99);
  });

  it('rejects a bad signature', () => {
    const r = verifyCoinPaymentsIpn(body, 'deadbeef', secret);
    expect(r.valid).toBe(false);
  });

  it('marks pending status when not complete', () => {
    const b = 'invoice=p&txn_id=t&status=1';
    const h = createHmac('sha512', secret).update(b, 'utf8').digest('hex');
    expect(verifyCoinPaymentsIpn(b, h, secret).status).toBe('CONFIRMING');
  });
});

describe('verifyBinancePayWebhook', () => {
  const secret = 'binance_secret';
  const body = JSON.stringify({ bizStatus: 'PAY_SUCCESS', merchantTradeNo: 'pay_456' });
  const headers = { timestamp: '1700000000000', nonce: 'abc123' };
  const sig = createHmac('sha512', secret)
    .update(`${headers.timestamp}\n${headers.nonce}\n${body}\n`, 'utf8')
    .digest('hex')
    .toUpperCase();

  it('accepts a correctly signed PAY_SUCCESS webhook', () => {
    const r = verifyBinancePayWebhook(body, { ...headers, signature: sig }, secret);
    expect(r.valid).toBe(true);
    expect(r.status).toBe('COMPLETED');
    expect(r.orderId).toBe('pay_456');
  });

  it('rejects a tampered body', () => {
    const r = verifyBinancePayWebhook(body + 'x', { ...headers, signature: sig }, secret);
    expect(r.valid).toBe(false);
  });

  it('rejects missing headers', () => {
    const r = verifyBinancePayWebhook(body, { timestamp: null, nonce: null, signature: null }, secret);
    expect(r.valid).toBe(false);
  });
});
