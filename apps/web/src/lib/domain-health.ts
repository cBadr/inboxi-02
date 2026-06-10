import { Resolver } from 'node:dns/promises';
import { prisma, DnsStatus } from '@inboxi/db';
import { planDnsRecords, type DnsRecord } from '@inboxi/integrations/cloudflare';

// Use public resolvers so checks reflect the world's view, not the local box.
function resolver(): Resolver {
  const r = new Resolver({ timeout: 5000, tries: 2 });
  r.setServers(['1.1.1.1', '8.8.8.8']);
  return r;
}

export interface DnsCheckItem {
  type: string;
  name: string;
  expected: string;
  found: string[];
  ok: boolean;
}

export interface DnsVerifyReport {
  status: DnsStatus;
  items: DnsCheckItem[];
  passed: number;
  total: number;
}

function mailHost(domain: string): string {
  return process.env.MAIL_HOST ?? `mail.${domain}`;
}

// Live-verify a domain's mail DNS by querying public resolvers, then persist the
// resulting status + timestamp. Honest: reflects what is actually published.
export async function verifyDomainDns(domainId: string): Promise<DnsVerifyReport | null> {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain) return null;

  const res = resolver();
  const host = mailHost(domain.name);
  const items: DnsCheckItem[] = [];

  // MX
  try {
    const mx = await res.resolveMx(domain.name);
    const hosts = mx.map((m) => m.exchange.replace(/\.$/, '').toLowerCase());
    items.push({
      type: 'MX',
      name: domain.name,
      expected: host,
      found: hosts,
      ok: hosts.includes(host.toLowerCase()),
    });
  } catch {
    items.push({ type: 'MX', name: domain.name, expected: host, found: [], ok: false });
  }

  // SPF (TXT on apex)
  const apexTxt = await safeTxt(res, domain.name);
  items.push({
    type: 'SPF',
    name: domain.name,
    expected: 'v=spf1 …',
    found: apexTxt.filter((t) => t.startsWith('v=spf1')),
    ok: apexTxt.some((t) => t.startsWith('v=spf1')),
  });

  // DKIM (TXT on selector._domainkey)
  const dkimName = `${domain.dkimSelector}._domainkey.${domain.name}`;
  const dkimTxt = await safeTxt(res, dkimName);
  items.push({
    type: 'DKIM',
    name: dkimName,
    expected: 'v=DKIM1; k=rsa; p=…',
    found: dkimTxt.filter((t) => t.includes('DKIM1')),
    ok: dkimTxt.some((t) => t.includes('DKIM1') && (!domain.dkimPublicKey || t.includes(domain.dkimPublicKey.slice(0, 40)))),
  });

  // DMARC
  const dmarcName = `_dmarc.${domain.name}`;
  const dmarcTxt = await safeTxt(res, dmarcName);
  items.push({
    type: 'DMARC',
    name: dmarcName,
    expected: 'v=DMARC1; …',
    found: dmarcTxt.filter((t) => t.startsWith('v=DMARC1')),
    ok: dmarcTxt.some((t) => t.startsWith('v=DMARC1')),
  });

  const passed = items.filter((i) => i.ok).length;
  const status =
    passed === items.length ? DnsStatus.VERIFIED : passed === 0 ? DnsStatus.FAILED : DnsStatus.VERIFYING;

  const report = { status, items, passed, total: items.length };
  await prisma.domain.update({
    where: { id: domain.id },
    data: {
      dnsStatus: status,
      dnsLastCheckedAt: new Date(),
      dnsReport: report as object,
    },
  });

  return report;
}

async function safeTxt(res: Resolver, name: string): Promise<string[]> {
  try {
    const records = await res.resolveTxt(name);
    return records.map((chunks) => chunks.join(''));
  } catch {
    return [];
  }
}

// ── Reputation + Trust Score ─────────────────────────────────

const DNSBLS = ['zen.spamhaus.org', 'bl.spamcop.net', 'b.barracudacentral.org'];

export interface ReputationResult {
  ip: string;
  listings: Array<{ source: string; listed: boolean }>;
  trustScore: number;
  factors: Record<string, number>;
}

// Query DNSBLs for the sending IP and compute a composite trust score that also
// factors in DNS auth coverage and outbound bounce/complaint rates. Persists
// ReputationCheck + TrustScore rows.
export async function runReputationScan(domainId: string): Promise<ReputationResult | null> {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain) return null;

  const ip = process.env.SERVER_IP ?? '127.0.0.1';
  const reversed = ip.split('.').reverse().join('.');
  const res = resolver();

  const listings = await Promise.all(
    DNSBLS.map(async (bl) => {
      try {
        const answers = await res.resolve4(`${reversed}.${bl}`);
        return { source: bl, listed: answers.length > 0 };
      } catch {
        return { source: bl, listed: false }; // NXDOMAIN = not listed
      }
    }),
  );

  await prisma.reputationCheck.createMany({
    data: listings.map((l) => ({
      domainId: domain.id,
      ipAddress: ip,
      source: `dnsbl:${l.source}`,
      listed: l.listed,
    })),
  });

  // Compose the score.
  const factors: Record<string, number> = {};
  let score = 100;

  const blacklisted = listings.filter((l) => l.listed).length;
  if (blacklisted > 0) {
    const penalty = blacklisted * 30;
    factors.blacklists = -penalty;
    score -= penalty;
  }

  // DNS auth coverage.
  const dnsReport = await verifyDomainDns(domainId);
  if (dnsReport) {
    const missing = dnsReport.total - dnsReport.passed;
    if (missing > 0) {
      const penalty = missing * 10;
      factors.dnsAuth = -penalty;
      score -= penalty;
    }
  }

  // Bounce / complaint rate over recent outbound.
  const recentOutbound = await prisma.outboundMessage.count({
    where: { mailbox: { domainId: domain.id } },
  });
  if (recentOutbound > 0) {
    const bad = await prisma.outboundMessage.count({
      where: { mailbox: { domainId: domain.id }, status: { in: ['BOUNCED', 'COMPLAINED'] } },
    });
    const rate = bad / recentOutbound;
    if (rate > 0.05) {
      const penalty = Math.round(rate * 100);
      factors.bounceRate = -penalty;
      score -= penalty;
    }
  }

  score = Math.max(0, Math.min(100, score));

  await prisma.trustScore.create({
    data: { domainId: domain.id, ipAddress: ip, score, factors },
  });

  return { ip, listings, trustScore: score, factors };
}

// ── Deliverability summary (read-only, for the domain detail page) ──

export interface DeliverabilityCheck {
  label: string;
  ok: boolean;
  detail?: string;
  fixable?: boolean;
}

export interface DeliverabilityView {
  score: number;
  checks: DeliverabilityCheck[];
  recommendations: string[];
}

interface DomainForDeliverability {
  name: string;
  dnsReport: unknown;
  dkimSelector: string;
  reputationChecks?: Array<{ source: string; listed: boolean }>;
}

// Combine the stored DNS report, a live PTR lookup, and the latest blacklist
// checks into a deliverability score + actionable recommendations.
export async function getDeliverability(
  domain: DomainForDeliverability,
): Promise<DeliverabilityView> {
  const report = domain.dnsReport as { items?: DnsCheckItem[] } | null;
  const ok = (type: string) => report?.items?.find((i) => i.type === type)?.ok ?? false;
  const mx = ok('MX');
  const spf = ok('SPF');
  const dkim = ok('DKIM');
  const dmarc = ok('DMARC');

  const ip = process.env.SERVER_IP ?? '';
  const host = (process.env.MAIL_HOST ?? `mail.${domain.name}`).toLowerCase();
  let ptrOk = false;
  let ptrValue = '';
  if (ip) {
    try {
      const names = await resolver().reverse(ip);
      ptrValue = names.join(', ');
      ptrOk = names.some((h) => h.replace(/\.$/, '').toLowerCase() === host);
    } catch {
      ptrValue = '';
    }
  }

  const listed = (domain.reputationChecks ?? []).filter((c) => c.listed).map((c) => c.source);
  const notBlacklisted = listed.length === 0;

  const checks: DeliverabilityCheck[] = [
    { label: 'MX record', ok: mx, fixable: true },
    { label: 'SPF', ok: spf, fixable: true },
    { label: 'DKIM', ok: dkim, fixable: true },
    { label: 'DMARC', ok: dmarc, fixable: true },
    { label: 'Reverse DNS (PTR)', ok: ptrOk, detail: ptrValue || 'not set' },
    { label: 'Not on blacklists', ok: notBlacklisted, detail: listed.join(', ') || 'clean' },
  ];
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);

  const recommendations: string[] = [];
  if (!mx || !spf || !dkim || !dmarc)
    recommendations.push('Click “Provision DNS” to auto-create the missing MX/SPF/DKIM/DMARC records.');
  if (!ptrOk)
    recommendations.push(
      `Set reverse DNS (PTR) for ${ip || 'your server IP'} to ${host} in your VPS/DigitalOcean panel (rename the droplet to ${host}).`,
    );
  if (!notBlacklisted)
    recommendations.push(`Request delisting from: ${listed.join(', ')} — see spamhaus.org/check.`);
  if (recommendations.length === 0)
    recommendations.push('Excellent — full authentication and clean reputation. Inbox-ready.');

  return { score, checks, recommendations };
}

// Planned records for display/copy in the admin UI.
export function plannedRecordsFor(domain: {
  name: string;
  dkimSelector: string;
  dkimPublicKey: string | null;
}): DnsRecord[] {
  return planDnsRecords({
    domain: domain.name,
    mailHost: mailHost(domain.name),
    serverIp: process.env.SERVER_IP ?? '127.0.0.1',
    dkimSelector: domain.dkimSelector,
    dkimPublicKeyDns: domain.dkimPublicKey ?? '(provision DNS to generate)',
    includeWebA: true,
  });
}
