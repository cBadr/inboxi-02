'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { writeAudit, AUDIT } from '@/lib/audit';
import { requestIp } from '@/lib/request-ip';

// Bulk message management for the admin domain inbox. Each action operates on a
// set of message ids and revalidates the domain inbox view.

async function revalidateDomain(domainId: string) {
  revalidatePath(`/admin/inboxes/${domainId}`);
}

export async function setMessagesArchived(
  domainId: string,
  ids: string[],
  archived: boolean,
): Promise<void> {
  const admin = await requireAdmin();
  if (ids.length === 0) return;
  const res = await prisma.message.updateMany({
    where: { id: { in: ids }, domainId },
    data: { isArchived: archived },
  });
  // One row for the whole batch — a bulk action must not flood the audit log
  // with one entry per message.
  await writeAudit({
    actorId: admin.id,
    action: AUDIT.MESSAGE_ARCHIVE,
    entity: 'message',
    ipAddress: await requestIp(),
    metadata: {
      domainId,
      count: res.count,
      requested: ids.length,
      ids: ids.slice(0, 50),
      archived,
    },
  });
  await revalidateDomain(domainId);
}

export async function setMessagesRead(
  domainId: string,
  ids: string[],
  read: boolean,
): Promise<void> {
  const admin = await requireAdmin();
  if (ids.length === 0) return;
  const res = await prisma.message.updateMany({
    where: { id: { in: ids }, domainId },
    data: { isRead: read },
  });
  await writeAudit({
    actorId: admin.id,
    action: AUDIT.MESSAGE_READ_STATE,
    entity: 'message',
    ipAddress: await requestIp(),
    metadata: { domainId, count: res.count, requested: ids.length, ids: ids.slice(0, 50), read },
  });
  await revalidateDomain(domainId);
}

export async function setMessagesStarred(
  domainId: string,
  ids: string[],
  starred: boolean,
): Promise<void> {
  const admin = await requireAdmin();
  if (ids.length === 0) return;
  const res = await prisma.message.updateMany({
    where: { id: { in: ids }, domainId },
    data: { isStarred: starred },
  });
  await writeAudit({
    actorId: admin.id,
    action: AUDIT.MESSAGE_STAR,
    entity: 'message',
    ipAddress: await requestIp(),
    metadata: { domainId, count: res.count, requested: ids.length, ids: ids.slice(0, 50), starred },
  });
  await revalidateDomain(domainId);
}

export async function deleteMessages(domainId: string, ids: string[]): Promise<void> {
  const admin = await requireAdmin();
  if (ids.length === 0) return;
  const res = await prisma.message.deleteMany({ where: { id: { in: ids }, domainId } });
  // Highest-priority audit event in this file: a bulk delete of customer mail.
  await writeAudit({
    actorId: admin.id,
    action: AUDIT.MESSAGE_DELETE,
    entity: 'message',
    ipAddress: await requestIp(),
    metadata: { domainId, count: res.count, requested: ids.length, ids: ids.slice(0, 50) },
  });
  await revalidateDomain(domainId);
}

// ── Form actions for the single-message view ──

export async function archiveMessageAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const domainId = String(formData.get('domainId') ?? '');
  const archived = String(formData.get('archived') ?? 'true') === 'true';
  const res = await prisma.message.updateMany({
    where: { id, domainId },
    data: { isArchived: archived },
  });
  if (res.count === 0) return;
  await writeAudit({
    actorId: admin.id,
    action: AUDIT.MESSAGE_ARCHIVE,
    entity: 'message',
    entityId: id,
    ipAddress: await requestIp(),
    metadata: { domainId, archived },
  });
  revalidatePath(`/admin/inboxes/${domainId}`);
  revalidatePath(`/admin/inboxes/${domainId}/${id}`);
}

export async function starMessageAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const domainId = String(formData.get('domainId') ?? '');
  const starred = String(formData.get('starred') ?? 'true') === 'true';
  const res = await prisma.message.updateMany({
    where: { id, domainId },
    data: { isStarred: starred },
  });
  if (res.count === 0) return;
  await writeAudit({
    actorId: admin.id,
    action: AUDIT.MESSAGE_STAR,
    entity: 'message',
    entityId: id,
    ipAddress: await requestIp(),
    metadata: { domainId, starred },
  });
  revalidatePath(`/admin/inboxes/${domainId}/${id}`);
}

export async function deleteMessageAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const domainId = String(formData.get('domainId') ?? '');
  const res = await prisma.message.deleteMany({ where: { id, domainId } });
  // Must run before redirect() below — redirect throws internally in Next, so
  // any code after it in this function never executes. Only claim a deletion
  // that actually removed a row.
  if (res.count > 0)
    await writeAudit({
      actorId: admin.id,
      action: AUDIT.MESSAGE_DELETE,
      entity: 'message',
      entityId: id,
      ipAddress: await requestIp(),
      metadata: { domainId },
    });
  revalidatePath(`/admin/inboxes/${domainId}`);
  redirect(`/admin/inboxes/${domainId}`);
}
