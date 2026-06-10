// One-off / repeatable DNS reconciliation for a single domain via Cloudflare.
// Matches records by EXACT fqdn+type and deletes duplicates (self-healing) —
// the same logic as CloudflareClient.upsertRecord. Reads CLOUDFLARE_API_TOKEN
// from /opt/inboxi/.env. Usage:
//   node reconcile-dns.mjs <domain> <selector> <dmarcPolicy> <pubkey>
import { readFileSync } from 'node:fs';

const [domain, selector, dmarcPolicy, pubkey] = process.argv.slice(2);
if (!domain || !selector || !pubkey) {
  console.error('usage: node reconcile-dns.mjs <domain> <selector> <dmarcPolicy> <pubkey>');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync('/opt/inboxi/.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const token = env.CLOUDFLARE_API_TOKEN;
const serverIp = env.SERVER_IP || '67.205.130.18';
const mailHost = env.MAIL_HOST || `mail.${domain}`;
if (!token) {
  console.error('CLOUDFLARE_API_TOKEN missing');
  process.exit(1);
}

const API = 'https://api.cloudflare.com/client/v4';
async function cf(path, init) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  return res.json();
}

const mailLabel =
  mailHost === domain ? '@' : mailHost.endsWith(`.${domain}`) ? mailHost.slice(0, -(domain.length + 1)) : mailHost;

const mailWithinDomain = mailHost === domain || mailHost.endsWith(`.${domain}`);
const records = [
  { type: 'MX', name: '@', content: mailHost, priority: 10 },
  { type: 'TXT', name: '@', content: `v=spf1 a mx ip4:${serverIp} ~all` },
  { type: 'TXT', name: `${selector}._domainkey`, content: `v=DKIM1; k=rsa; p=${pubkey}` },
  { type: 'TXT', name: '_dmarc', content: `v=DMARC1; p=${dmarcPolicy || 'quarantine'}; rua=mailto:dmarc@${domain}; fo=1` },
  { type: 'TXT', name: '_smtp._tls', content: `v=TLSRPTv1; rua=mailto:tlsrpt@${domain}` },
  // mail-host A record only in the zone that hosts the MTA (see records.ts).
  ...(mailWithinDomain ? [{ type: 'A', name: mailLabel, content: serverIp }] : []),
  { type: 'A', name: '@', content: serverIp },
  { type: 'A', name: 'mta-sts', content: serverIp },
  { type: 'TXT', name: '_mta-sts', content: 'v=STSv1; id=inboxi1' },
];

const zres = await cf(`/zones?name=${encodeURIComponent(domain)}`);
if (!zres.success || !zres.result.length) {
  console.error('zone not found', JSON.stringify(zres.errors));
  process.exit(1);
}
const zoneId = zres.result[0].id;
console.log('zone', zoneId);

for (const rec of records) {
  const fqdn = rec.name === '@' ? domain : `${rec.name}.${domain}`;
  const list = await cf(`/zones/${zoneId}/dns_records?type=${rec.type}&name=${encodeURIComponent(fqdn)}`);
  const matches = (list.success ? list.result : []).filter((r) => r.name === fqdn && r.type === rec.type);
  const body = JSON.stringify({
    type: rec.type,
    name: fqdn,
    content: rec.content,
    priority: rec.priority,
    ttl: 1,
  });
  if (matches.length === 0) {
    const r = await cf(`/zones/${zoneId}/dns_records`, { method: 'POST', body });
    console.log('CREATE', rec.type, fqdn, r.success ? 'ok' : JSON.stringify(r.errors));
  } else {
    const r = await cf(`/zones/${zoneId}/dns_records/${matches[0].id}`, { method: 'PUT', body });
    console.log('UPDATE', rec.type, fqdn, r.success ? 'ok' : JSON.stringify(r.errors));
    for (const dup of matches.slice(1)) {
      const dr = await cf(`/zones/${zoneId}/dns_records/${dup.id}`, { method: 'DELETE' });
      console.log('  DELETE dup', dup.id, dr.success ? 'ok' : JSON.stringify(dr.errors));
    }
  }
}

// Clean up a legacy junk A record created by an earlier planner bug, where a
// shared mail host got nested under a secondary zone (e.g.
// "mail.inboxi.online.ostazna.bar").
if (!mailWithinDomain) {
  const junkFqdn = `${mailHost}.${domain}`;
  const junk = await cf(`/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(junkFqdn)}`);
  for (const r of junk.success ? junk.result : []) {
    const dr = await cf(`/zones/${zoneId}/dns_records/${r.id}`, { method: 'DELETE' });
    console.log('DELETE junk', junkFqdn, dr.success ? 'ok' : JSON.stringify(dr.errors));
  }
}

console.log('ZONE_ID=' + zoneId);
