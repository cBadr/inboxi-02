'use server';

import { revalidatePath } from 'next/cache';
import { prisma, MailboxType } from '@inboxi/db';
import { createMailboxSchema } from '@inboxi/shared';
import { requireUser } from '@/lib/session';
import { getAvailableDomains } from '@/lib/domains';
import { generateApiKey } from '@/lib/apikey';

export interface ActionResult {
  ok: boolean;
  error?: string;
  plaintext?: string; // one-time secret (API key creation)
}

// Effective mailbox cap = the highest maxMailboxes among the user's active
// subscriptions, falling back to the free plan.
async function mailboxLimitFor(userId: string): Promise<number> {
  const subs = await prisma.subscription.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { plan: true },
  });
  if (subs.length) return Math.max(...subs.map((s) => s.plan.maxMailboxes));
  const free = await prisma.plan.findUnique({ where: { slug: 'free' } });
  return free?.maxMailboxes ?? 1;
}

export async function createMailbox(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = createMailboxSchema.safeParse({
    localPart: String(formData.get('localPart') ?? '').toLowerCase(),
    domainId: String(formData.get('domainId') ?? ''),
    displayName: formData.get('displayName') ? String(formData.get('displayName')) : undefined,
  });
  if (!parsed.success) return { ok: false, error: 'Invalid input' };

  // Domain must be available to this user.
  const available = await getAvailableDomains(user.id);
  const domain = available.find((d) => d.id === parsed.data.domainId);
  if (!domain) return { ok: false, error: 'Domain not available' };

  // Enforce plan limit.
  const count = await prisma.mailbox.count({ where: { userId: user.id } });
  const limit = await mailboxLimitFor(user.id);
  if (count >= limit) {
    return { ok: false, error: `Mailbox limit reached (${limit}). Upgrade to add more.` };
  }

  const address = `${parsed.data.localPart}@${domain.name}`;
  const existing = await prisma.mailbox.findUnique({ where: { address } });
  if (existing) return { ok: false, error: 'That address is already taken' };

  await prisma.mailbox.create({
    data: {
      address,
      localPart: parsed.data.localPart,
      domainId: domain.id,
      userId: user.id,
      type: MailboxType.ACTIVE,
      displayName: parsed.data.displayName ?? null,
    },
  });

  revalidatePath('/dashboard/mailboxes');
  return { ok: true };
}

export async function updateProfile(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const name = String(formData.get('name') ?? '').trim().slice(0, 120);
  await prisma.user.update({ where: { id: user.id }, data: { name: name || null } });
  revalidatePath('/dashboard/profile');
  return { ok: true };
}

export async function createApiKey(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const name = String(formData.get('name') ?? 'API key').slice(0, 60) || 'API key';
  const key = generateApiKey();
  await prisma.apiKey.create({
    data: { userId: user.id, name, keyPrefix: key.prefix, keyHash: key.hash },
  });
  revalidatePath('/dashboard/api');
  return { ok: true, plaintext: key.plaintext };
}

export async function revokeApiKey(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (key && key.userId === user.id) {
    await prisma.apiKey.update({ where: { id }, data: { isActive: false } });
  }
  revalidatePath('/dashboard/api');
}

export async function setForwarding(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const forwardTo = String(formData.get('forwardTo') ?? '').trim().toLowerCase();
  const mailbox = await prisma.mailbox.findUnique({ where: { id } });
  if (!mailbox || mailbox.userId !== user.id) return;
  await prisma.mailbox.update({
    where: { id },
    data: { forwardTo: forwardTo && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(forwardTo) ? forwardTo : null },
  });
  revalidatePath(`/dashboard/mailboxes/${id}`);
}

export async function deleteMailbox(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const mailbox = await prisma.mailbox.findUnique({ where: { id } });
  if (!mailbox || mailbox.userId !== user.id) return;
  await prisma.mailbox.delete({ where: { id } });
  revalidatePath('/dashboard/mailboxes');
}
