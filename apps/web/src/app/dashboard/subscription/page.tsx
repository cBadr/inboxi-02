import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { requireUser } from '@/lib/session';
import { planPerks } from '@/lib/plan-display';

export const dynamic = 'force-dynamic';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

const PAYMENT_BADGE: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  PENDING: 'bg-amber-100 text-amber-700',
  CONFIRMING: 'bg-blue-100 text-blue-700',
  FAILED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-gray-100 text-gray-500',
};

export default async function SubscriptionPage() {
  const user = await requireUser();
  const [sub, free, mailboxCount, domainCount, sendCounter, payments] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { plan: true },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.plan.findUnique({ where: { slug: 'free' } }),
    prisma.mailbox.count({ where: { userId: user.id } }),
    prisma.domainAssignment.count({ where: { userId: user.id } }),
    prisma.usageCounter.findUnique({
      where: { userId_metric_windowKey: { userId: user.id, metric: 'send.daily', windowKey: todayKey() } },
    }),
    prisma.payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 6 }),
  ]);

  const plan = sub?.plan ?? free;
  const isPaid = Boolean(sub);
  const sendToday = sendCounter?.value ?? 0;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Subscription</h1>
        <Link
          href="/pricing"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-brand-dark"
        >
          {isPaid ? 'Change plan' : 'Upgrade with crypto'}
        </Link>
      </div>

      {/* current plan */}
      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-brand/5 to-accent/5 p-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Current plan</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-900">{plan?.name ?? 'Free'}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isPaid ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {isPaid ? 'Active' : 'Free tier'}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">${String(plan?.priceUsd ?? 0)}</div>
            {isPaid && sub?.currentPeriodEnd && (
              <div className="text-xs text-gray-500">
                Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        {plan && (
          <div className="grid gap-4 p-6 sm:grid-cols-3">
            <Usage label="Mailboxes" used={mailboxCount} max={plan.maxMailboxes} />
            <Usage label="Custom domains" used={domainCount} max={plan.maxDomains} />
            <Usage
              label="Sent today"
              used={sendToday}
              max={plan.dailySendQuota}
              hint={plan.dailySendQuota === 0 ? 'sending not included' : undefined}
            />
          </div>
        )}
      </div>

      {/* included features */}
      {plan && (
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-800">What&apos;s included</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {planPerks(plan).map((perk) => (
              <li key={perk} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-100 text-[10px] text-green-700">
                  ✓
                </span>
                {perk}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* payment history */}
      <div className="rounded-2xl border bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-800">Payment history</h2>
        {payments.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">No payments yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div>
                  <span className="font-medium text-gray-900">${String(p.amountUsd)}</span>
                  <span className="ml-2 text-xs text-gray-400">{p.provider}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PAYMENT_BADGE[p.status] ?? 'bg-gray-100'}`}>
                    {p.status}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleDateString()}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Usage({
  label,
  used,
  max,
  hint,
}: {
  label: string;
  used: number;
  max: number;
  hint?: string;
}) {
  const unlimited = max === 0 && label !== 'Sent today';
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const near = pct >= 80;
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-gray-400">{label}</span>
        <span className="text-sm font-semibold text-gray-900">
          {used}
          {!unlimited && max > 0 && <span className="text-gray-400"> / {max}</span>}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full ${near ? 'bg-amber-500' : 'bg-brand'}`}
          style={{ width: `${max > 0 ? pct : 6}%` }}
        />
      </div>
      <div className="mt-1 text-[11px] text-gray-400">{hint ?? (unlimited ? 'unlimited' : max > 0 ? `${pct}% used` : '—')}</div>
    </div>
  );
}
