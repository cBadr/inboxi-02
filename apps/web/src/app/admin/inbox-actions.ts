'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';

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
  await requireAdmin();
  if (ids.length === 0) return;
  await prisma.message.updateMany({
    where: { id: { in: ids }, domainId },
    data: { isArchived: archived },
  });
  await revalidateDomain(domainId);
}

export async function setMessagesRead(
  domainId: string,
  ids: string[],
  read: boolean,
): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  await prisma.message.updateMany({
    where: { id: { in: ids }, domainId },
    data: { isRead: read },
  });
  await revalidateDomain(domainId);
}

export async function setMessagesStarred(
  domainId: string,
  ids: string[],
  starred: boolean,
): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  await prisma.message.updateMany({
    where: { id: { in: ids }, domainId },
    data: { isStarred: starred },
  });
  await revalidateDomain(domainId);
}

export async function deleteMessages(domainId: string, ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  await prisma.message.deleteMany({ where: { id: { in: ids }, domainId } });
  await revalidateDomain(domainId);
}

// ── Form actions for the single-message view ──

export async function archiveMessageAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const domainId = String(formData.get('domainId') ?? '');
  const archived = String(formData.get('archived') ?? 'true') === 'true';
  await prisma.message.update({ where: { id }, data: { isArchived: archived } });
  revalidatePath(`/admin/inboxes/${domainId}`);
  revalidatePath(`/admin/inboxes/${domainId}/${id}`);
}

export async function starMessageAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const domainId = String(formData.get('domainId') ?? '');
  const starred = String(formData.get('starred') ?? 'true') === 'true';
  await prisma.message.update({ where: { id }, data: { isStarred: starred } });
  revalidatePath(`/admin/inboxes/${domainId}/${id}`);
}

export async function deleteMessageAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const domainId = String(formData.get('domainId') ?? '');
  await prisma.message.delete({ where: { id } }).catch(() => {});
  revalidatePath(`/admin/inboxes/${domainId}`);
  redirect(`/admin/inboxes/${domainId}`);
}
