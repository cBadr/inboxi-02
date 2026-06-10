import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { deliverVia, deliverWithFailover } from '../transport';
import { screenOutbound } from '../antiabuse';
import type { TransportConfig } from '../types';

const testTransport: TransportConfig = { name: 'test', kind: 'TEST_STREAM' };

const { privateKey: TEST_KEY } = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

describe('deliverVia (stream transport)', () => {
  it('builds and "sends" a message, returning raw MIME', async () => {
    const res = await deliverVia(testTransport, {
      from: 'me@inboxi.online',
      to: 'you@example.com',
      subject: 'Hello',
      text: 'Hi there',
    });
    expect(res.ok).toBe(true);
    expect(res.transport).toBe('test');
    expect(res.raw).toContain('Subject: Hello');
    expect(res.raw).toContain('you@example.com');
  });

  it('signs with DKIM when a key is provided', async () => {
    // A throwaway 1024-bit RSA key for the test only.
    const res = await deliverVia(testTransport, {
      from: 'me@inboxi.online',
      to: 'you@example.com',
      subject: 'Signed',
      text: 'body',
      dkim: {
        domainName: 'inboxi.online',
        keySelector: 'inboxi',
        privateKey: TEST_KEY,
      },
    });
    expect(res.ok).toBe(true);
    expect(res.raw).toMatch(/DKIM-Signature:/i);
    expect(res.raw).toContain('d=inboxi.online');
  });
});

describe('deliverWithFailover', () => {
  it('falls through a failing transport to a working one', async () => {
    const broken: TransportConfig = {
      name: 'broken-smtp',
      kind: 'SMTP_RELAY',
      smtp: { host: '127.0.0.1', port: 1, secure: false },
    };
    const res = await deliverWithFailover([broken, testTransport], {
      from: 'me@inboxi.online',
      to: 'you@example.com',
      text: 'x',
    });
    expect(res.ok).toBe(true);
    expect(res.transport).toBe('test');
  });
});

describe('screenOutbound', () => {
  it('passes clean mail', () => {
    const v = screenOutbound({ subject: 'Meeting notes', text: 'See you at 3pm.' });
    expect(v.allowed).toBe(true);
    expect(v.score).toBe(0);
  });

  it('blocks banned phrases', () => {
    const v = screenOutbound({ subject: 'You have won', text: 'double your bitcoin now' });
    expect(v.allowed).toBe(false);
    expect(v.reasons.length).toBeGreaterThan(0);
  });
});
