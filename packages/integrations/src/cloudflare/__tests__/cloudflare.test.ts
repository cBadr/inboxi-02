import { describe, it, expect } from 'vitest';
import { planDnsRecords } from '../records';
import { generateDkimKeyPair } from '../dkim';
import { CloudflareClient } from '../client';

describe('planDnsRecords', () => {
  const records = planDnsRecords({
    domain: 'inboxi.online',
    mailHost: 'mail.inboxi.online',
    serverIp: '67.205.130.18',
    dkimSelector: 'inboxi',
    dkimPublicKeyDns: 'PUBKEYDATA',
    includeWebA: true,
  });

  it('includes MX pointing at the mail host', () => {
    const mx = records.find((r) => r.type === 'MX');
    expect(mx).toMatchObject({ content: 'mail.inboxi.online', priority: 10, name: '@' });
  });

  it('builds SPF with the server IP', () => {
    const spf = records.find((r) => r.type === 'TXT' && r.content.startsWith('v=spf1'));
    expect(spf?.content).toContain('ip4:67.205.130.18');
  });

  it('builds the DKIM record at the selector subdomain', () => {
    const dkim = records.find((r) => r.name === 'inboxi._domainkey');
    expect(dkim?.content).toBe('v=DKIM1; k=rsa; p=PUBKEYDATA');
  });

  it('builds DMARC', () => {
    const dmarc = records.find((r) => r.name === '_dmarc');
    expect(dmarc?.content).toContain('v=DMARC1');
  });

  it('uses "mail" as the A label for the mail host', () => {
    const a = records.find((r) => r.type === 'A' && r.name === 'mail');
    expect(a?.content).toBe('67.205.130.18');
  });
});

describe('generateDkimKeyPair', () => {
  it('produces a private key and a single-line DNS public key', () => {
    const kp = generateDkimKeyPair();
    expect(kp.privateKeyPem).toContain('BEGIN RSA PRIVATE KEY');
    expect(kp.publicKeyDns).not.toContain('\n');
    expect(kp.publicKeyDns.length).toBeGreaterThan(100);
  });
});

describe('CloudflareClient', () => {
  it('creates a zone when none exists (mock fetch)', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/zones?name=')) {
        return { json: async () => ({ success: true, errors: [], result: [] }) } as Response;
      }
      return {
        json: async () => ({ success: true, errors: [], result: { id: 'zone123' } }),
      } as Response;
    }) as unknown as typeof fetch;

    const cf = new CloudflareClient({ apiToken: 't', accountId: 'acc', fetchImpl });
    const zoneId = await cf.ensureZone('inboxi.online');
    expect(zoneId).toBe('zone123');
    expect(calls.some((c) => c.startsWith('POST'))).toBe(true);
  });
});
