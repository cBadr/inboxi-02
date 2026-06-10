'use server';

import { revalidatePath } from 'next/cache';
import { prisma, DomainAvailability } from '@inboxi/db';
import { createDomainSchema, addressPatternSchema, SETTING_KEYS } from '@inboxi/shared';
import { generateDkimKeyPair } from '@inboxi/integrations/cloudflare';
import { requireAdmin } from '@/lib/session';
import { setSetting } from '@/lib/settings';
import { provisionDomainDns } from '@/lib/dns';
import { verifyDomainDns, runReputationScan } from '@/lib/domain-health';
import { encryptSecret } from '@/lib/crypto';
import { syncHostList, ensureCatchAllMailbox } from '@/lib/haraka';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function createDomain(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = createDomainSchema.safeParse({
    name: String(formData.get('name') ?? '').toLowerCase().trim(),
    availability: String(formData.get('availability') ?? 'FREE'),
    dnsProvider: String(formData.get('dnsProvider') ?? 'CLOUDFLARE_PLATFORM'),
  });
  if (!parsed.success) return { ok: false, error: 'Invalid domain' };

  const existing = await prisma.domain.findUnique({ where: { name: parsed.data.name } });
  if (existing) return { ok: false, error: 'Domain already exists' };

  const domain = await prisma.domain.create({
    data: {
      name: parsed.data.name,
      availability: parsed.data.availability as DomainAvailability,
      dnsProvider: parsed.data.dnsProvider,
    },
  });
  // Every domain gets a catch-all mailbox + must be added to the MTA host_list.
  await ensureCatchAllMailbox(domain.id, domain.name);
  await syncHostList();
  // Auto-provision DNS: generate DKIM keys + plan records, and push to Cloudflare
  // when a token is configured. Never fail domain creation on a DNS hiccup.
  await provisionDomainDns(domain.id).catch(() => {});
  revalidatePath('/admin/domains');
  return { ok: true };
}

export async function setDomainAvailability(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const availability = String(formData.get('availability') ?? 'FREE') as DomainAvailability;
  await prisma.domain.update({ where: { id }, data: { availability } });
  revalidatePath('/admin/domains');
}

export async function toggleDomainActive(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const domain = await prisma.domain.findUnique({ where: { id } });
  if (!domain) return;
  await prisma.domain.update({ where: { id }, data: { isActive: !domain.isActive } });
  await syncHostList();
  revalidatePath('/admin/domains');
  revalidatePath(`/admin/domains/${id}`);
}

export async function updateTempMailSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const pattern = addressPatternSchema.safeParse({
    type: String(formData.get('patternType') ?? 'alphanumeric'),
    length: Number(formData.get('length') ?? 10),
  });
  if (!pattern.success) return { ok: false, error: 'Invalid pattern' };

  const destruction = Math.max(5, Math.min(1440, Number(formData.get('destructionMinutes') ?? 60)));
  const gate = Math.max(1, Math.min(50, Number(formData.get('gateAfter') ?? 3)));

  await setSetting(SETTING_KEYS.TEMPMAIL_ADDRESS_PATTERN, pattern.data, 'tempmail');
  await setSetting(SETTING_KEYS.TEMPMAIL_DESTRUCTION_MINUTES, destruction, 'tempmail');
  await setSetting(SETTING_KEYS.TEMPMAIL_GATE_AFTER_MESSAGES, gate, 'tempmail');

  revalidatePath('/admin/settings');
  return { ok: true };
}

export async function provisionDns(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await provisionDomainDns(id);
  revalidatePath('/admin/domains');
  revalidatePath(`/admin/domains/${id}`);
}

export async function recheckDns(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await verifyDomainDns(id);
  revalidatePath(`/admin/domains/${id}`);
  revalidatePath('/admin/domains');
}

export async function scanReputation(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await runReputationScan(id);
  revalidatePath(`/admin/domains/${id}`);
}

export async function regenDkim(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const kp = generateDkimKeyPair();
  await prisma.domain.update({
    where: { id },
    data: { dkimPublicKey: kp.publicKeyDns, dkimPrivateKey: encryptSecret(kp.privateKeyPem), dnsStatus: 'PENDING' },
  });
  revalidatePath(`/admin/domains/${id}`);
}

export async function deleteDomain(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  // Guard: refuse if the domain has real (non catch-all) mailboxes.
  const count = await prisma.mailbox.count({
    where: { domainId: id, type: { not: 'CATCH_ALL' } },
  });
  if (count > 0) return;
  const domain = await prisma.domain.findUnique({ where: { id } });
  // Detach the catch-all link, then delete the domain (cascades its mailboxes).
  if (domain?.catchAllMailboxId) {
    await prisma.domain.update({ where: { id }, data: { catchAllMailboxId: null } });
  }
  await prisma.domain.delete({ where: { id } });
  await syncHostList();
  revalidatePath('/admin/domains');
}

export async function assignDomain(formData: FormData): Promise<void> {
  await requireAdmin();
  const domainId = String(formData.get('domainId') ?? '');
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) return;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  await prisma.domainAssignment.upsert({
    where: { domainId_userId: { domainId, userId: user.id } },
    update: {},
    create: { domainId, userId: user.id },
  });
  // Give the assigned user ownership of the domain's catch-all so they receive
  // mail sent to any (including unprovisioned) address on the domain.
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (domain) await ensureCatchAllMailbox(domain.id, domain.name, user.id);
  revalidatePath(`/admin/domains/${domainId}`);
}

export async function unassignDomain(formData: FormData): Promise<void> {
  await requireAdmin();
  const assignmentId = String(formData.get('assignmentId') ?? '');
  const domainId = String(formData.get('domainId') ?? '');
  await prisma.domainAssignment.delete({ where: { id: assignmentId } }).catch(() => {});
  revalidatePath(`/admin/domains/${domainId}`);
}

export async function saveGeneralSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const siteName = String(formData.get('siteName') ?? '').trim() || 'Inboxi';
  const maxSize = Math.max(1, Math.min(100, Number(formData.get('maxMessageSizeMb') ?? 25)));
  await setSetting(SETTING_KEYS.SITE_NAME, siteName, 'general');
  await setSetting(SETTING_KEYS.MAIL_MAX_MESSAGE_SIZE_MB, maxSize, 'mail');
  revalidatePath('/admin/settings');
  return { ok: true };
}

export async function setUserBanned(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const banned = String(formData.get('banned') ?? 'false') === 'true';
  await prisma.user.update({
    where: { id },
    data: { isBanned: banned, bannedReason: banned ? 'Banned by admin' : null },
  });
  revalidatePath('/admin/users');
}

export async function setUserRole(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (id === admin.id) return; // don't let an admin change their own role
  const roleName = String(formData.get('roleName') ?? '');
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  await prisma.user.update({ where: { id }, data: { roleId: role?.id ?? null } });
  revalidatePath('/admin/users');
}
