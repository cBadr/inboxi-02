'use server';

import { randomBytes } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { revalidatePath } from 'next/cache';
import { prisma } from '@inboxi/db';
import { CloudflareClient, type CloudflareRecord, type DnsRecord } from '@inboxi/integrations/cloudflare';
import { requireAdmin } from '@/lib/session';
import { provisionDomainDns } from '@/lib/dns';
import { verifyDomainDns } from '@/lib/domain-health';
import { sendMail } from '@/lib/send';
import { writeAudit } from '@/lib/audit';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function cf(): CloudflareClient | null {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) return null;
  return new CloudflareClient({ apiToken: token, accountId: process.env.CLOUDFLARE_ACCOUNT_ID });
}

// ── DMARC policy ─────────────────────────────────────────────
export async function setDmarcPolicy(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const policy = String(formData.get('dmarcPolicy') ?? 'quarantine');
  if (!['none', 'quarantine', 'reject'].includes(policy)) return;
  await prisma.domain.update({ where: { id }, data: { dmarcPolicy: policy } });
  await provisionDomainDns(id).catch(() => {}); // re-publish DMARC with the new policy
  await verifyDomainDns(id).catch(() => {});
  await writeAudit({ actorId: admin.id, action: 'domain.dmarc', entity: 'domain', entityId: id, metadata: { policy } });
  revalidatePath(`/admin/domains/${id}`);
}

// ── Ownership verification (TXT token) ───────────────────────
export async function generateVerification(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const token = `inboxi-verify-${randomBytes(12).toString('hex')}`;
  await prisma.domain.update({ where: { id }, data: { verificationToken: token } });
  revalidatePath(`/admin/domains/${id}`);
}

export async function verifyOwnership(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const domain = await prisma.domain.findUnique({ where: { id } });
  if (!domain?.verificationToken) return;
  const res = new Resolver({ timeout: 5000 });
  res.setServers(['1.1.1.1', '8.8.8.8']);
  let verified = false;
  try {
    const txt = await res.resolveTxt(`_inboxi-verify.${domain.name}`);
    verified = txt.some((chunks) => chunks.join('') === domain.verificationToken);
  } catch {
    verified = false;
  }
  if (verified) {
    await prisma.domain.update({ where: { id }, data: { verifiedAt: new Date(), isActive: true } });
    await writeAudit({ actorId: admin.id, action: 'domain.verified', entity: 'domain', entityId: id });
  }
  revalidatePath(`/admin/domains/${id}`);
}

// ── Custom DNS records via Cloudflare ────────────────────────
export async function listDnsRecords(domainId: string): Promise<CloudflareRecord[]> {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  const client = cf();
  if (!domain?.cloudflareZoneId || !client) return [];
  return client.listRecords(domain.cloudflareZoneId).catch(() => []);
}

export async function addDnsRecord(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get('domainId') ?? '');
  const domain = await prisma.domain.findUnique({ where: { id } });
  const client = cf();
  if (!domain?.cloudflareZoneId || !client)
    return { ok: false, error: 'No Cloudflare zone for this domain (set a token + provision DNS).' };

  const record: DnsRecord = {
    type: String(formData.get('type') ?? 'TXT') as DnsRecord['type'],
    name: String(formData.get('name') ?? '@').trim() || '@',
    content: String(formData.get('content') ?? '').trim(),
    priority: formData.get('priority') ? Number(formData.get('priority')) : undefined,
  };
  if (!record.content) return { ok: false, error: 'Content required' };

  try {
    await client.createRecord(domain.cloudflareZoneId, record);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Cloudflare error' };
  }
  await writeAudit({ actorId: admin.id, action: 'domain.dns.add', entity: 'domain', entityId: id, metadata: { ...record } });
  revalidatePath(`/admin/domains/${id}`);
  return { ok: true };
}

export async function deleteDnsRecord(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('domainId') ?? '');
  const recordId = String(formData.get('recordId') ?? '');
  const domain = await prisma.domain.findUnique({ where: { id } });
  const client = cf();
  if (!domain?.cloudflareZoneId || !client) return;
  await client.deleteRecord(domain.cloudflareZoneId, recordId).catch(() => {});
  await writeAudit({ actorId: admin.id, action: 'domain.dns.delete', entity: 'domain', entityId: id, metadata: { recordId } });
  revalidatePath(`/admin/domains/${id}`);
}

// ── Send a test message from this domain ─────────────────────
export async function sendDomainTest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get('domainId') ?? '');
  const localPart = String(formData.get('localPart') ?? 'postmaster').trim() || 'postmaster';
  const to = String(formData.get('to') ?? '').trim();
  if (!to) return { ok: false, error: 'Recipient required' };
  const domain = await prisma.domain.findUnique({ where: { id } });
  if (!domain) return { ok: false, error: 'Domain not found' };

  const result = await sendMail(admin, {
    from: `${localPart}@${domain.name}`,
    to,
    subject: 'Inboxi test message',
    text: `This is a test message from ${localPart}@${domain.name} sent via Inboxi.`,
  });
  await writeAudit({ actorId: admin.id, action: 'domain.test_send', entity: 'domain', entityId: id, metadata: { to, status: result.status } });
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'send failed' };
}

// ── Bulk actions (domains list) ──────────────────────────────
export async function bulkRecheckAll(): Promise<void> {
  await requireAdmin();
  const domains = await prisma.domain.findMany({ where: { isActive: true }, select: { id: true } });
  for (const d of domains) await verifyDomainDns(d.id).catch(() => {});
  revalidatePath('/admin/domains');
}

export async function bulkProvisionAll(): Promise<void> {
  await requireAdmin();
  const domains = await prisma.domain.findMany({ where: { isActive: true }, select: { id: true } });
  for (const d of domains) {
    await provisionDomainDns(d.id).catch(() => {});
    await verifyDomainDns(d.id).catch(() => {});
  }
  revalidatePath('/admin/domains');
}
