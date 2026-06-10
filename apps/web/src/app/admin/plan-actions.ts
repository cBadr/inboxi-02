'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { PLAN_FEATURES } from '@/lib/plan-features';

interface ActionResult {
  ok: boolean;
  error?: string;
}

function num(formData: FormData, key: string, fallback = 0): number {
  const v = Number(formData.get(key));
  return Number.isFinite(v) ? v : fallback;
}

function collectFeatures(formData: FormData): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const f of PLAN_FEATURES) out[f] = formData.get(`feature_${f}`) === 'on';
  return out;
}

export async function createPlan(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim();
  if (!slug || !name) return { ok: false, error: 'Slug and name required' };
  if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, error: 'Slug must be a-z0-9-' };
  const exists = await prisma.plan.findUnique({ where: { slug } });
  if (exists) return { ok: false, error: 'Slug exists' };

  await prisma.plan.create({
    data: { slug, name, priceUsd: 0, sortOrder: (await prisma.plan.count()) },
  });
  revalidatePath('/admin/plans');
  return { ok: true };
}

export async function updatePlan(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) return { ok: false, error: 'Not found' };

  await prisma.plan.update({
    where: { id },
    data: {
      name: String(formData.get('name') ?? plan.name).trim(),
      description: String(formData.get('description') ?? '').trim() || null,
      priceUsd: num(formData, 'priceUsd', Number(plan.priceUsd)),
      billingPeriodDays: num(formData, 'billingPeriodDays', plan.billingPeriodDays),
      maxMailboxes: num(formData, 'maxMailboxes', plan.maxMailboxes),
      maxDomains: num(formData, 'maxDomains', plan.maxDomains),
      dailySendQuota: num(formData, 'dailySendQuota', plan.dailySendQuota),
      dailyReceiveQuota: num(formData, 'dailyReceiveQuota', plan.dailyReceiveQuota),
      retentionDays: num(formData, 'retentionDays', plan.retentionDays),
      sortOrder: num(formData, 'sortOrder', plan.sortOrder),
      isActive: formData.get('isActive') === 'on',
      isFree: formData.get('isFree') === 'on',
      features: collectFeatures(formData),
    },
  });
  revalidatePath('/admin/plans');
  revalidatePath(`/admin/plans/${id}`);
  return { ok: true };
}

export async function deletePlan(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const subs = await prisma.subscription.count({ where: { planId: id } });
  if (subs > 0) return; // guard: keep plans that have subscriptions
  await prisma.plan.delete({ where: { id } }).catch(() => {});
  redirect('/admin/plans');
}

export async function togglePlanActive(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (plan) await prisma.plan.update({ where: { id }, data: { isActive: !plan.isActive } });
  revalidatePath('/admin/plans');
}
