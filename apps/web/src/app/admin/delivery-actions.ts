'use server';

import { revalidatePath } from 'next/cache';
import { prisma, TransportType } from '@inboxi/db';
import { deliverVia } from '@inboxi/integrations/delivery';
import { requireAdmin } from '@/lib/session';
import { encryptSecret } from '@/lib/crypto';
import { transportToConfig } from '@/lib/send';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function bool(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on';
}

export async function createTransport(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  const type = String(formData.get('type') ?? 'SMTP_RELAY') as TransportType;
  if (!name) return { ok: false, error: 'Name required' };

  const host = String(formData.get('smtpHost') ?? '').trim() || null;
  const port = Number(formData.get('smtpPort') ?? 0) || null;
  const username = String(formData.get('smtpUsername') ?? '').trim() || null;
  const passwordRaw = String(formData.get('smtpPassword') ?? '').trim();

  if (!host || !port) return { ok: false, error: 'SMTP host and port required' };

  const exists = await prisma.deliveryTransport.findUnique({ where: { name } });
  if (exists) return { ok: false, error: 'A transport with that name exists' };

  await prisma.deliveryTransport.create({
    data: {
      name,
      type: type === 'SELF_HOST' ? TransportType.SELF_HOST : TransportType.SMTP_RELAY,
      smtpHost: host,
      smtpPort: port,
      smtpSecure: bool(formData, 'smtpSecure'),
      smtpUsername: username,
      smtpPassword: passwordRaw ? encryptSecret(passwordRaw) : null,
      isActive: true,
    },
  });
  revalidatePath('/admin/delivery');
  return { ok: true };
}

export async function toggleTransport(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const t = await prisma.deliveryTransport.findUnique({ where: { id } });
  if (t) await prisma.deliveryTransport.update({ where: { id }, data: { isActive: !t.isActive } });
  revalidatePath('/admin/delivery');
}

export async function setDefaultTransport(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await prisma.$transaction([
    prisma.deliveryTransport.updateMany({ data: { isDefault: false } }),
    prisma.deliveryTransport.update({ where: { id }, data: { isDefault: true, isActive: true } }),
  ]);
  revalidatePath('/admin/delivery');
}

export async function deleteTransport(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await prisma.domainDeliveryConfig.deleteMany({ where: { transportId: id } });
  await prisma.deliveryTransport.delete({ where: { id } }).catch(() => {});
  revalidatePath('/admin/delivery');
}

export async function assignDomainTransport(formData: FormData): Promise<void> {
  await requireAdmin();
  const domainId = String(formData.get('domainId') ?? '');
  const transportId = String(formData.get('transportId') ?? '') || null;
  if (!domainId) return;
  await prisma.domainDeliveryConfig.upsert({
    where: { domainId },
    update: { transportId },
    create: { domainId, transportId },
  });
  revalidatePath('/admin/delivery');
}

export async function sendTestEmail(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const to = String(formData.get('to') ?? '').trim();
  const from = String(formData.get('from') ?? 'postmaster@inboxi.online').trim();
  if (!to) return { ok: false, error: 'Recipient required' };

  const t = await prisma.deliveryTransport.findUnique({ where: { id } });
  if (!t) return { ok: false, error: 'Transport not found' };

  const result = await deliverVia(transportToConfig(t), {
    from,
    to,
    subject: 'Inboxi delivery test',
    text: `This is a delivery test sent through the "${t.name}" transport.`,
  });
  return result.ok
    ? { ok: true }
    : { ok: false, error: result.error ?? 'send failed' };
}
