import { prisma, DnsStatus } from '@inboxi/db';
import {
  planDnsRecords,
  generateDkimKeyPair,
  CloudflareClient,
  type DnsRecord,
} from '@inboxi/integrations/cloudflare';
import { encryptSecret, decryptSecret } from './crypto';

// A DKIM key is healthy only if it exists AND decrypts with the current
// ENCRYPTION_KEY. If the key was encrypted with a stale ENCRYPTION_KEY, signing
// silently fails — so we treat that as "needs regeneration".
function dkimKeyHealthy(encrypted: string | null): boolean {
  if (!encrypted) return false;
  try {
    decryptSecret(encrypted);
    return true;
  } catch {
    return false;
  }
}

export interface DnsProvisionResult {
  ok: boolean;
  applied: boolean; // true when records were pushed to Cloudflare
  records: DnsRecord[];
  error?: string;
}

// Provision a domain's DNS: ensure a DKIM key pair exists, plan the records,
// and (when a Cloudflare token is configured) create the zone and push them.
// Without a token it runs as a dry-run — keys are generated and stored, records
// are planned and returned for manual setup, status moves to VERIFYING.
export async function provisionDomainDns(domainId: string): Promise<DnsProvisionResult> {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain) return { ok: false, applied: false, records: [], error: 'domain_not_found' };

  // Ensure DKIM keys (self-healing: regenerate if missing OR undecryptable).
  let publicKeyDns = domain.dkimPublicKey;
  if (!dkimKeyHealthy(domain.dkimPrivateKey) || !domain.dkimPublicKey) {
    const kp = generateDkimKeyPair();
    publicKeyDns = kp.publicKeyDns;
    await prisma.domain.update({
      where: { id: domain.id },
      data: {
        dkimPublicKey: kp.publicKeyDns,
        dkimPrivateKey: encryptSecret(kp.privateKeyPem),
        dkimGeneratedAt: new Date(),
      },
    });
  }

  const records = planDnsRecords({
    domain: domain.name,
    mailHost: process.env.MAIL_HOST ?? `mail.${domain.name}`,
    serverIp: process.env.SERVER_IP ?? '127.0.0.1',
    dkimSelector: domain.dkimSelector,
    dkimPublicKeyDns: publicKeyDns ?? '',
    dmarcPolicy: (domain.dmarcPolicy as 'none' | 'quarantine' | 'reject') ?? 'quarantine',
    includeWebA: true,
    includeMtaSts: true,
  });

  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    // Dry-run: records planned, awaiting external/manual application.
    await prisma.domain.update({
      where: { id: domain.id },
      data: { dnsStatus: DnsStatus.VERIFYING, dnsLastCheckedAt: new Date() },
    });
    return { ok: true, applied: false, records };
  }

  try {
    const cf = new CloudflareClient({
      apiToken: token,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    });
    const zoneId = domain.cloudflareZoneId ?? (await cf.ensureZone(domain.name));
    await cf.upsertRecords(zoneId, records);
    await prisma.domain.update({
      where: { id: domain.id },
      data: {
        cloudflareZoneId: zoneId,
        dnsStatus: DnsStatus.VERIFIED,
        dnsLastCheckedAt: new Date(),
      },
    });
    return { ok: true, applied: true, records };
  } catch (err) {
    await prisma.domain.update({
      where: { id: domain.id },
      data: { dnsStatus: DnsStatus.FAILED, dnsLastCheckedAt: new Date() },
    });
    return {
      ok: false,
      applied: false,
      records,
      error: err instanceof Error ? err.message : 'cloudflare_error',
    };
  }
}
