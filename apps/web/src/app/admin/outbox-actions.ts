'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { sendMail } from '@/lib/send';
import { writeAudit } from '@/lib/audit';

// Re-send a stored outbound message (e.g. after a transient failure). Uses the
// stored body; attachments are not retained, so a resend is body-only.
export async function resendOutbound(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const row = await prisma.outboundMessage.findUnique({ where: { id } });
  if (!row) return;
  await sendMail(admin, {
    from: row.fromAddress,
    to: row.toAddress,
    subject: row.subject ?? undefined,
    text: row.bodyText ?? undefined,
    html: row.bodyHtml ?? undefined,
  });
  await writeAudit({ actorId: admin.id, action: 'outbound.resend', entity: 'outbound', entityId: id });
  revalidatePath('/admin/outbox');
}

export async function deleteOutbound(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await prisma.outboundMessage.delete({ where: { id } }).catch(() => {});
  revalidatePath('/admin/outbox');
}

// Bulk delete (client-callable). Useful to clear failed/blocked noise.
export async function deleteOutboundBulk(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length === 0) return;
  await prisma.outboundMessage.deleteMany({ where: { id: { in: ids } } });
  revalidatePath('/admin/outbox');
}
