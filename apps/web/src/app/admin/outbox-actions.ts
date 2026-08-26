'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { sendMail } from '@/lib/send';
import { writeAudit, AUDIT } from '@/lib/audit';
import { requestIp } from '@/lib/request-ip';

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
  await writeAudit({
    actorId: admin.id,
    action: 'outbound.resend',
    entity: 'outbound',
    entityId: id,
  });
  revalidatePath('/admin/outbox');
}

export async function deleteOutbound(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const res = await prisma.outboundMessage.deleteMany({ where: { id } });
  if (res.count === 0) return;
  await writeAudit({
    actorId: admin.id,
    action: AUDIT.OUTBOUND_DELETE,
    entity: 'outbound',
    entityId: id,
    ipAddress: await requestIp(),
  });
  revalidatePath('/admin/outbox');
}

// Bulk delete (client-callable). Useful to clear failed/blocked noise. One
// audit row for the whole batch — not one per message.
export async function deleteOutboundBulk(ids: string[]): Promise<void> {
  const admin = await requireAdmin();
  if (ids.length === 0) return;
  const res = await prisma.outboundMessage.deleteMany({ where: { id: { in: ids } } });
  await writeAudit({
    actorId: admin.id,
    action: AUDIT.OUTBOUND_DELETE,
    entity: 'outbound',
    ipAddress: await requestIp(),
    metadata: { count: res.count, requested: ids.length, ids: ids.slice(0, 50) },
  });
  revalidatePath('/admin/outbox');
}
