'use server';

import { revalidatePath } from 'next/cache';
import { prisma, DomainAvailability } from '@inboxi/db';
import {
  createDomainSchema,
  addressPatternSchema,
  SETTING_KEYS,
  checkDomainDeletion,
} from '@inboxi/shared';
import { generateDkimKeyPair } from '@inboxi/integrations/cloudflare';
import { requireAdmin } from '@/lib/session';
import { setSetting } from '@/lib/settings';
import { provisionDomainDns } from '@/lib/dns';
import { verifyDomainDns, runReputationScan, rescanDeliverability } from '@/lib/domain-health';
import { encryptSecret } from '@/lib/crypto';
import { syncHostList, ensureCatchAllMailbox } from '@/lib/haraka';
import { writeAudit } from '@/lib/audit';
import { sendOperatorAlert } from '@/lib/alerts';
import { hashPassword } from '@/lib/auth';

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

// One-click auto-fix: (re)provision all DNS records via Cloudflare, then verify.
export async function autoFixDns(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await provisionDomainDns(id);
  await rescanDeliverability(id).catch(() => {});
  await writeAudit({ actorId: admin.id, action: 'domain.autofix_dns', entity: 'domain', entityId: id });
  revalidatePath(`/admin/domains/${id}`);
  revalidatePath('/admin/domains');
}

// Per-domain deliverability + inbox-placement re-check (used by the list row).
export async function rescanDomain(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await rescanDeliverability(id).catch(() => {});
  revalidatePath('/admin/domains');
  revalidatePath(`/admin/domains/${id}`);
}

export async function scanReputation(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await runReputationScan(id);
  revalidatePath(`/admin/domains/${id}`);
}

export async function regenDkim(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const kp = generateDkimKeyPair();
  await prisma.domain.update({
    where: { id },
    data: {
      dkimPublicKey: kp.publicKeyDns,
      dkimPrivateKey: encryptSecret(kp.privateKeyPem),
      dnsStatus: 'PENDING',
    },
  });
  // Push the new DKIM record to Cloudflare (and re-verify) automatically.
  await provisionDomainDns(id).catch(() => {});
  await verifyDomainDns(id).catch(() => {});
  await writeAudit({ actorId: admin.id, action: 'domain.regen_dkim', entity: 'domain', entityId: id });
  revalidatePath(`/admin/domains/${id}`);
}

// Deleting a domain cascades its mailboxes and every message in them, so this
// action reports what it did instead of returning void: a refused delete used to
// look identical to a successful one — the button did nothing and said nothing.
export async function deleteDomain(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'No domain selected.' };

  const domain = await prisma.domain.findUnique({ where: { id } });
  if (!domain) return { ok: false, error: 'That domain no longer exists.' };

  // Guard: refuse if the domain has real (non catch-all) mailboxes.
  const realMailboxCount = await prisma.mailbox.count({
    where: { domainId: id, type: { not: 'CATCH_ALL' } },
  });
  const verdict = checkDomainDeletion({ name: domain.name, realMailboxCount });
  if (!verdict.allowed) return { ok: false, error: verdict.reason };

  // Count what the cascade will take, so the audit entry records the blast radius.
  const messageCount = await prisma.message.count({ where: { mailbox: { domainId: id } } });

  // Detach the catch-all link, then delete the domain (cascades its mailboxes).
  if (domain.catchAllMailboxId) {
    await prisma.domain.update({ where: { id }, data: { catchAllMailboxId: null } });
  }
  await prisma.domain.delete({ where: { id } });
  await syncHostList();

  await writeAudit({
    actorId: admin.id,
    action: 'domain.delete',
    entity: 'domain',
    entityId: id,
    metadata: { name: domain.name, cascadedMessages: messageCount },
  });

  revalidatePath('/admin/domains');
  return { ok: true };
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
  revalidatePath('/admin/domains');
}

// Assign a domain to an entire group at once — every member of the group gains
// access in a single action ("a batch of users").
export async function assignDomainToGroup(formData: FormData): Promise<void> {
  await requireAdmin();
  const domainId = String(formData.get('domainId') ?? '');
  const groupId = String(formData.get('groupId') ?? '');
  if (!groupId) return;
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) return;
  await prisma.domainAssignment.upsert({
    where: { domainId_groupId: { domainId, groupId } },
    update: {},
    create: { domainId, groupId },
  });
  revalidatePath('/admin/domains');
  revalidatePath(`/admin/domains/${domainId}`);
}

export async function unassignDomain(formData: FormData): Promise<void> {
  await requireAdmin();
  const assignmentId = String(formData.get('assignmentId') ?? '');
  const domainId = String(formData.get('domainId') ?? '');
  await prisma.domainAssignment.delete({ where: { id: assignmentId } }).catch(() => {});
  revalidatePath(`/admin/domains/${domainId}`);
  revalidatePath('/admin/domains');
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

export async function createUser(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim() || null;
  const password = String(formData.get('password') ?? '');
  const roleName = String(formData.get('roleName') ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Invalid email' };
  if (password.length < 8) return { ok: false, error: 'Password must be ≥ 8 chars' };
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { ok: false, error: 'A user with that email exists' };
  const role = roleName ? await prisma.role.findUnique({ where: { name: roleName } }) : null;
  const user = await prisma.user.create({
    data: { email, name, passwordHash: await hashPassword(password), roleId: role?.id ?? null },
  });
  await writeAudit({ actorId: admin.id, action: 'user.create', entity: 'user', entityId: user.id });
  revalidatePath('/admin/users');
  return { ok: true };
}

export async function resetUserPassword(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const password = String(formData.get('password') ?? '');
  if (password.length < 8) return;
  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
  await writeAudit({ actorId: admin.id, action: 'user.reset_password', entity: 'user', entityId: id });
  revalidatePath('/admin/users');
}

export async function setUserQuota(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const raw = String(formData.get('quota') ?? '').trim();
  const quota = raw === '' ? null : Math.max(0, Math.min(1_000_000, Number(raw) || 0));
  await prisma.user.update({ where: { id }, data: { sendQuotaOverride: quota } });
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

// --- Operator alerting -----------------------------------------------------

export async function saveAlertSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const chatId = String(formData.get('alertChatId') ?? '').trim();
  // Telegram chat ids are numeric, optionally negative for groups/channels.
  if (chatId && !/^-?\d{5,20}$/.test(chatId)) {
    return { ok: false, error: 'Chat ID must be a number, e.g. 123456789 or -1001234567890.' };
  }
  await setSetting(SETTING_KEYS.ALERTS_TELEGRAM_CHAT_ID, chatId, 'alerts');
  await writeAudit({
    actorId: admin.id,
    action: 'settings.alerts_updated',
    entity: 'setting',
    entityId: SETTING_KEYS.ALERTS_TELEGRAM_CHAT_ID,
    metadata: { configured: chatId !== '' },
  });
  revalidatePath('/admin/settings');
  return { ok: true };
}

// Prove the alert channel actually works, rather than discovering at 2am that it doesn't.
export async function sendTestAlert(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const outcome = await sendOperatorAlert(
    '✅ <b>Inboxi test alert</b>\nOperator alerting is wired correctly.',
  );
  if (outcome.delivered) return { ok: true };
  const reasons: Record<string, string> = {
    no_bot_token: 'TELEGRAM_BOT_TOKEN is not set on the server.',
    no_chat_id: 'No alert chat ID saved yet — save one first.',
    send_failed: `Telegram rejected the message${outcome.detail ? `: ${outcome.detail}` : '.'}`,
  };
  return { ok: false, error: reasons[outcome.reason] ?? 'Could not send the alert.' };
}
