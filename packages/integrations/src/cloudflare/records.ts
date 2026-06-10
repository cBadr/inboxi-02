// DNS record planner. Given a mail domain and infrastructure parameters,
// produce the records required for receiving + authenticated sending
// (MX, SPF, DKIM, DMARC, A). Pure + unit-testable.

export interface DnsRecord {
  type: 'A' | 'MX' | 'TXT' | 'CNAME';
  name: string; // record name relative to the zone root, or '@'
  content: string;
  priority?: number; // MX only
  ttl?: number;
}

export interface DnsPlanInput {
  domain: string;
  mailHost: string; // e.g. mail.inboxi.online
  serverIp: string; // e.g. 67.205.130.18
  dkimSelector: string; // e.g. inboxi
  dkimPublicKeyDns: string; // base64 SPKI body for the DKIM TXT record
  dmarcReportTo?: string; // mailbox for aggregate reports
  includeWebA?: boolean; // add an A record for the apex pointing at the server
}

export function planDnsRecords(input: DnsPlanInput): DnsRecord[] {
  const records: DnsRecord[] = [
    { type: 'MX', name: '@', content: input.mailHost, priority: 10 },
    { type: 'A', name: mailSubdomain(input.mailHost, input.domain), content: input.serverIp },
    { type: 'TXT', name: '@', content: `v=spf1 a mx ip4:${input.serverIp} ~all` },
    {
      type: 'TXT',
      name: `${input.dkimSelector}._domainkey`,
      content: `v=DKIM1; k=rsa; p=${input.dkimPublicKeyDns}`,
    },
    {
      type: 'TXT',
      name: '_dmarc',
      content: `v=DMARC1; p=quarantine; rua=mailto:${input.dmarcReportTo ?? `dmarc@${input.domain}`}; fo=1`,
    },
    {
      // SMTP TLS reporting (RFC 8460) — improves trust + surfaces TLS issues.
      type: 'TXT',
      name: '_smtp._tls',
      content: `v=TLSRPTv1; rua=mailto:tlsrpt@${input.domain}`,
    },
  ];

  if (input.includeWebA) {
    records.push({ type: 'A', name: '@', content: input.serverIp });
  }
  return records;
}

// The label for the mail host's A record relative to the zone (e.g. "mail").
function mailSubdomain(mailHost: string, domain: string): string {
  if (mailHost === domain) return '@';
  if (mailHost.endsWith(`.${domain}`)) return mailHost.slice(0, -1 * (domain.length + 1));
  return mailHost;
}
