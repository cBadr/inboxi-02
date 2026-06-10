import { Resolver } from 'node:dns/promises';
import net from 'node:net';
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

const DNSBLS = [
  'zen.spamhaus.org',
  'bl.spamcop.net',
  'b.barracudacentral.org',
  'dnsbl.sorbs.net',
  'cbl.abuseat.org',
];

// Connect to a mail host and read the SMTP greeting banner — confirms the MTA is
// reachable on port 25 from the outside world's perspective.
export async function checkSmtpBanner(
  host: string,
  port = 25,
): Promise<{ ok: boolean; banner?: string }> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean, banner?: string) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ ok, banner });
    };
    const socket = net.createConnection({ host, port });
    socket.setTimeout(5000);
    socket.on('data', (d) => finish(true, d.toString().split(/\r?\n/)[0]));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

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
  key: string;
  label: string;
  ok: boolean;
  value?: string; // the published / observed value
  fix?: 'dns' | 'manual'; // how it can be fixed
  hint?: string; // manual-fix instruction
}

export interface DeliverabilityView {
  score: number;
  checks: DeliverabilityCheck[];
  recommendations: string[];
  dnsFixable: boolean; // any failing check is auto-fixable via Provision DNS
}

interface DomainForDeliverability {
  name: string;
  dnsReport: unknown;
  dkimSelector: string;
  dkimPublicKey?: string | null;
  reputationChecks?: Array<{ source: string; listed: boolean }>;
}

// Combine the stored DNS report, a live PTR + SMTP-banner check, and the latest
// blacklist checks into a detailed deliverability score + recommendations.
export async function getDeliverability(
  domain: DomainForDeliverability,
): Promise<DeliverabilityView> {
  const report = domain.dnsReport as { items?: DnsCheckItem[] } | null;
  const item = (type: string) => report?.items?.find((i) => i.type === type);
  const okOf = (type: string) => item(type)?.ok ?? false;
  const valOf = (type: string) => item(type)?.found?.[0] ?? '';

  const ip = process.env.SERVER_IP ?? '';
  const host = (process.env.MAIL_HOST ?? `mail.${domain.name}`).toLowerCase();

  // Reverse DNS (PTR)
  let ptrOk = false;
  let ptrValue = 'not set';
  if (ip) {
    try {
      const names = await resolver().reverse(ip);
      ptrValue = names.join(', ');
      ptrOk = names.some((h) => h.replace(/\.$/, '').toLowerCase() === host);
    } catch {
      ptrValue = 'not set';
    }
  }

  // SMTP reachability (port 25 banner)
  const smtp = await checkSmtpBanner(host, 25);

  const listed = (domain.reputationChecks ?? []).filter((c) => c.listed).map((c) => c.source);
  const notBlacklisted = listed.length === 0;

  const checks: DeliverabilityCheck[] = [
    { key: 'mx', label: 'MX record', ok: okOf('MX'), value: valOf('MX'), fix: 'dns' },
    { key: 'spf', label: 'SPF', ok: okOf('SPF'), value: valOf('SPF'), fix: 'dns' },
    {
      key: 'dkim',
      label: 'DKIM',
      ok: okOf('DKIM'),
      value: okOf('DKIM') ? `selector: ${domain.dkimSelector}` : '',
      fix: 'dns',
    },
    { key: 'dmarc', label: 'DMARC', ok: okOf('DMARC'), value: valOf('DMARC'), fix: 'dns' },
    {
      key: 'ptr',
      label: 'Reverse DNS (PTR)',
      ok: ptrOk,
      value: ptrValue,
      fix: 'manual',
      hint: `Rename your droplet / set PTR for ${ip || 'the server IP'} to ${host} (DigitalOcean → Droplet → Rename).`,
    },
    {
      key: 'smtp',
      label: 'SMTP reachable (:25)',
      ok: smtp.ok,
      value: smtp.banner ?? 'no response',
    },
    {
      key: 'blacklist',
      label: 'Not on blacklists',
      ok: notBlacklisted,
      value: notBlacklisted ? 'clean' : listed.join(', '),
      fix: notBlacklisted ? undefined : 'manual',
      hint: notBlacklisted ? undefined : 'Request delisting at check.spamhaus.org and the listed RBLs.',
    },
  ];
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  const dnsFixable = checks.some((c) => !c.ok && c.fix === 'dns');

  const recommendations: string[] = [];
  if (dnsFixable)
    recommendations.push('Use “Fix DNS automatically” to publish the missing MX/SPF/DKIM/DMARC records via Cloudflare.');
  for (const c of checks) {
    if (!c.ok && c.fix === 'manual' && c.hint) recommendations.push(c.hint);
  }
  if (recommendations.length === 0)
    recommendations.push('Excellent — full authentication, reachable MTA, clean reputation. Inbox-ready.');

  return { score, checks, recommendations, dnsFixable };
}

// Planned records for display/copy in the admin UI.
export function plannedRecordsFor(domain: {
  name: string;
  dkimSelector: string;
  dkimPublicKey: string | null;
  dmarcPolicy?: string;
}): DnsRecord[] {
  return planDnsRecords({
    domain: domain.name,
    mailHost: mailHost(domain.name),
    serverIp: process.env.SERVER_IP ?? '127.0.0.1',
    dkimSelector: domain.dkimSelector,
    dkimPublicKeyDns: domain.dkimPublicKey ?? '(provision DNS to generate)',
    dmarcPolicy: (domain.dmarcPolicy as 'none' | 'quarantine' | 'reject') ?? 'quarantine',
    includeWebA: true,
    includeMtaSts: true,
  });
}
