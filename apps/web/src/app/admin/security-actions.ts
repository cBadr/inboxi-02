'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { writeAudit } from '@/lib/audit';

const KINDS = new Set(['IP', 'DOMAIN', 'EMAIL']);

export async function addBlock(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const kind = String(formData.get('kind') ?? 'EMAIL').toUpperCase();
  const value = String(formData.get('value') ?? '').trim().toLowerCase();
  const reason = String(formData.get('reason') ?? '').trim() || null;
  if (!KINDS.has(kind) || !value) return;
  await prisma.blocklist
    .upsert({
      where: { kind_value: { kind, value } },
      update: { reason },
      create: { kind, value, reason, createdBy: admin.email },
    })
    .catch(() => {});
  await writeAudit({ actorId: admin.id, action: 'security.block_add', entity: 'blocklist', entityId: value });
  revalidatePath('/admin/security');
}

export async function removeBlock(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await prisma.blocklist.delete({ where: { id } }).catch(() => {});
  revalidatePath('/admin/security');
}

export async function resolveReport(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? 'RESOLVED');
  await prisma.abuseReport.update({
    where: { id },
    data: { status, resolvedAt: new Date() },
  });
  revalidatePath('/admin/security');
}

// Block the reported target and resolve the report in one step.
export async function blockFromReport(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const report = await prisma.abuseReport.findUnique({ where: { id } });
  if (!report) return;
  const kind =
    report.targetType === 'ip' ? 'IP' : report.targetType === 'domain' ? 'DOMAIN' : 'EMAIL';
  await prisma.blocklist
    .upsert({
      where: { kind_value: { kind, value: report.targetValue.toLowerCase() } },
      update: { reason: `abuse report: ${report.reason}` },
      create: {
        kind,
        value: report.targetValue.toLowerCase(),
        reason: `abuse report: ${report.reason}`,
        createdBy: admin.email,
      },
    })
    .catch(() => {});
  await prisma.abuseReport.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
  await writeAudit({ actorId: admin.id, action: 'security.block_from_report', entity: 'abuse', entityId: id });
  revalidatePath('/admin/security');
}
