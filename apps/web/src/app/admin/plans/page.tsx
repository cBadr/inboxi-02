import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { ModuleActionForm } from '@/components/ModuleActionForm';
import { createPlan, togglePlanActive } from '../plan-actions';

export const dynamic = 'force-dynamic';

export default async function AdminPlansPage() {
  await requireAdmin();
  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { subscriptions: true } } },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Plans</h1>
      <p className="mt-1 text-sm text-gray-500">Subscription tiers (crypto billing).</p>

      <div className="mt-4 max-w-md">
        <ModuleActionForm action={createPlan} submitLabel="Create plan">
          <input name="slug" placeholder="slug (e.g. business)" className="w-full rounded border px-2 py-1.5 text-sm" />
          <input name="name" placeholder="Plan name" className="w-full rounded border px-2 py-1.5 text-sm" />
        </ModuleActionForm>
      </div>

      <table className="mt-6 w-full overflow-hidden rounded-lg border bg-white text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-400">
          <tr>
            <th className="p-3">Plan</th>
            <th className="p-3">Price</th>
            <th className="p-3">Mailboxes</th>
            <th className="p-3">Send/day</th>
            <th className="p-3">Retention</th>
            <th className="p-3">Subscribers</th>
            <th className="p-3">Active</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {plans.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="p-3 font-medium">
                {p.name} {p.isFree && <span className="text-xs text-gray-400">(free)</span>}
              </td>
              <td className="p-3">${String(p.priceUsd)}</td>
              <td className="p-3">{p.maxMailboxes}</td>
              <td className="p-3">{p.dailySendQuota}</td>
              <td className="p-3">{p.retentionDays}d</td>
              <td className="p-3">{p._count.subscriptions}</td>
              <td className="p-3">
                <form action={togglePlanActive}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className={p.isActive ? 'text-green-600' : 'text-gray-400'}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </button>
                </form>
              </td>
              <td className="p-3">
                <Link href={`/admin/plans/${p.id}`} className="text-xs text-brand hover:underline">
                  Edit →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
