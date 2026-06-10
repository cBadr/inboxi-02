'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { requireUser } from '@/lib/session';

// Message management for a user's own mailbox. Every action verifies the mailbox
// belongs to the signed-in user and only touches messages within it.

async function assertOwnedMailbox(mailboxId: string, userId: string): Promise<boolean> {
  const mb = await prisma.mailbox.findUnique({ where: { id: mailboxId }, select: { userId: true } });
  return !!mb && mb.userId === userId;
}

export async function setMessagesArchived(
  mailboxId: string,
  ids: string[],
  archived: boolean,
): Promise<void> {
  const user = await requireUser();
  if (ids.length === 0 || !(await assertOwnedMailbox(mailboxId, user.id))) return;
  await prisma.message.updateMany({ where: { id: { in: ids }, mailboxId }, data: { isArchived: archived } });
  revalidatePath(`/dashboard/mailboxes/${mailboxId}`);
}

export async function setMessagesRead(
  mailboxId: string,
  ids: string[],
  read: boolean,
): Promise<void> {
  const user = await requireUser();
  if (ids.length === 0 || !(await assertOwnedMailbox(mailboxId, user.id))) return;
  await prisma.message.updateMany({ where: { id: { in: ids }, mailboxId }, data: { isRead: read } });
  revalidatePath(`/dashboard/mailboxes/${mailboxId}`);
}

export async function setMessagesStarred(
  mailboxId: string,
  ids: string[],
  starred: boolean,
): Promise<void> {
  const user = await requireUser();
  if (ids.length === 0 || !(await assertOwnedMailbox(mailboxId, user.id))) return;
  await prisma.message.updateMany({ where: { id: { in: ids }, mailboxId }, data: { isStarred: starred } });
  revalidatePath(`/dashboard/mailboxes/${mailboxId}`);
}

export async function deleteMessages(mailboxId: string, ids: string[]): Promise<void> {
  const user = await requireUser();
  if (ids.length === 0 || !(await assertOwnedMailbox(mailboxId, user.id))) return;
  await prisma.message.deleteMany({ where: { id: { in: ids }, mailboxId } });
  revalidatePath(`/dashboard/mailboxes/${mailboxId}`);
}

// ── Form actions for the single-message view ──

export async function archiveMessageAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const mailboxId = String(formData.get('mailboxId') ?? '');
  if (!(await assertOwnedMailbox(mailboxId, user.id))) return;
  const archived = String(formData.get('archived') ?? 'true') === 'true';
  await prisma.message.updateMany({ where: { id, mailboxId }, data: { isArchived: archived } });
  revalidatePath(`/dashboard/mailboxes/${mailboxId}`);
  revalidatePath(`/dashboard/mailboxes/${mailboxId}/${id}`);
}

export async function starMessageAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const mailboxId = String(formData.get('mailboxId') ?? '');
  if (!(await assertOwnedMailbox(mailboxId, user.id))) return;
  const starred = String(formData.get('starred') ?? 'true') === 'true';
  await prisma.message.updateMany({ where: { id, mailboxId }, data: { isStarred: starred } });
  revalidatePath(`/dashboard/mailboxes/${mailboxId}/${id}`);
}

export async function deleteMessageAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const mailboxId = String(formData.get('mailboxId') ?? '');
  if (!(await assertOwnedMailbox(mailboxId, user.id))) return;
  await prisma.message.deleteMany({ where: { id, mailboxId } });
  revalidatePath(`/dashboard/mailboxes/${mailboxId}`);
  redirect(`/dashboard/mailboxes/${mailboxId}`);
}
