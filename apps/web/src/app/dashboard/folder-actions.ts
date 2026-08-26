'use server';

import { revalidatePath } from 'next/cache';
import { prisma, Prisma } from '@inboxi/db';
import { requireUser } from '@/lib/session';
import { isFolderColor } from '@/lib/folders';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function revalidateFolderViews(): void {
  revalidatePath('/dashboard/folders');
  revalidatePath('/dashboard/mailboxes');
}

function normalizedColor(formData: FormData): string | null {
  const raw = String(formData.get('color') ?? '');
  return raw && isFolderColor(raw) ? raw : null;
}

export async function createFolder(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const name = String(formData.get('name') ?? '')
    .trim()
    .slice(0, 40);
  if (!name) return { ok: false, error: 'Folder name is required' };
  const color = normalizedColor(formData);

  try {
    await prisma.folder.create({ data: { userId: user.id, name, color } });
  } catch (err) {
    // @@unique([userId, name]) — surface a message instead of an unhandled
    // exception that would take the page down.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { ok: false, error: `You already have a folder named "${name}"` };
    }
    throw err;
  }

  revalidateFolderViews();
  return { ok: true };
}

export async function renameFolder(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '')
    .trim()
    .slice(0, 40);
  if (!id) return { ok: false, error: 'Missing folder' };
  if (!name) return { ok: false, error: 'Folder name is required' };

  try {
    // The id comes from the client — every write is scoped to the caller's
    // own folders, never trusted on its own.
    const { count } = await prisma.folder.updateMany({
      where: { id, userId: user.id },
      data: { name },
    });
    if (count === 0) return { ok: false, error: 'Folder not found' };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { ok: false, error: `You already have a folder named "${name}"` };
    }
    throw err;
  }

  revalidateFolderViews();
  return { ok: true };
}

export async function setFolderColor(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const color = normalizedColor(formData);

  const { count } = await prisma.folder.updateMany({
    where: { id, userId: user.id },
    data: { color },
  });
  if (count === 0) return;
  revalidateFolderViews();
}

/** Take one message out of a folder, from the folder view itself. */
export async function unfileMessages(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  const folderId = String(formData.get('folderId') ?? '');
  if (!id || !folderId) return;

  // Scoped through the mailbox owner so this only ever touches the caller's
  // own mail, and through folderId so a stale form cannot clear a later filing.
  await prisma.message.updateMany({
    where: { id, folderId, mailbox: { userId: user.id } },
    data: { folderId: null },
  });
  revalidatePath(`/dashboard/folders/${folderId}`);
  revalidateFolderViews();
}

export async function deleteFolder(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  // Message.folderId is onDelete: SetNull — deleting a folder only un-files
  // its messages, it never deletes mail.
  const { count } = await prisma.folder.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) return;
  revalidateFolderViews();
}
