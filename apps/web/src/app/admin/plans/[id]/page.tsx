import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { ModuleActionForm } from '@/components/ModuleActionForm';
import { updatePlan, deletePlan } from '../../plan-actions';
import { PLAN_FEATURES } from '@/lib/plan-features';

export const dynamic = 'force-dynamic';

export default async function PlanEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const plan = await prisma.plan.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: true } } },
  });
  if (!plan) notFound();

  const features = (plan.features as Record<string, boolean> | null) ?? {};

  return (
    <div className="max-w-2xl">
      <Link href="/admin/plans" className="text-sm text-gray-500 hover:text-brand">
        ← Plans
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Edit plan: {plan.name}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {plan._count.subscriptions} active subscriber(s) · slug <code>{plan.slug}</code>
      </p>

      <div className="mt-4">
        <ModuleActionForm action={updatePlan} submitLabel="Save plan">
          <input type="hidden" name="id" value={plan.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field name="name" label="Name" defaultValue={plan.name} />
            <Field name="priceUsd" label="Price (USD)" type="number" step="0.01" defaultValue={String(plan.priceUsd)} />
            <Field name="maxMailboxes" label="Max mailboxes" type="number" defaultValue={String(plan.maxMailboxes)} />
            <Field name="maxDomains" label="Max custom domains" type="number" defaultValue={String(plan.maxDomains)} />
            <Field name="dailySendQuota" label="Daily send quota" type="number" defaultValue={String(plan.dailySendQuota)} />
            <Field name="dailyReceiveQuota" label="Daily receive quota" type="number" defaultValue={String(plan.dailyReceiveQuota)} />
            <Field name="retentionDays" label="Retention (days)" type="number" defaultValue={String(plan.retentionDays)} />
            <Field name="billingPeriodDays" label="Billing period (days)" type="number" defaultValue={String(plan.billingPeriodDays)} />
            <Field name="sortOrder" label="Sort order" type="number" defaultValue={String(plan.sortOrder)} />
          </div>
          <label className="block text-sm">
            <span className="text-gray-600">Description</span>
            <textarea name="description" defaultValue={plan.description ?? ''} rows={2} className="mt-1 w-full rounded border px-3 py-2" />
          </label>

          <div className="rounded border p-3">
            <div className="mb-2 text-sm font-medium text-gray-600">Features</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {PLAN_FEATURES.map((f) => (
                <label key={f} className="flex items-center gap-2">
                  <input type="checkbox" name={`feature_${f}`} defaultChecked={features[f] === true} />
                  {f}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isActive" defaultChecked={plan.isActive} /> Active
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="isFree" defaultChecked={plan.isFree} /> Free tier
            </label>
          </div>
        </ModuleActionForm>
      </div>

      {plan._count.subscriptions === 0 && (
        <form action={deletePlan} className="mt-4">
          <input type="hidden" name="id" value={plan.id} />
          <button className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
            Delete plan
          </button>
        </form>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = 'text',
  step,
}: {
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
  step?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600">{label}</span>
      <input name={name} type={type} step={step} defaultValue={defaultValue} className="mt-1 w-full rounded border px-3 py-2" />
    </label>
  );
}
