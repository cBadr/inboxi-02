import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function SubscriptionPage() {
  const user = await requireUser();
  const [sub, free, mailboxCount] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { plan: true },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.plan.findUnique({ where: { slug: 'free' } }),
    prisma.mailbox.count({ where: { userId: user.id } }),
  ]);
  const plan = sub?.plan ?? free;

  return (
    <div>
      <h1 className="text-2xl font-bold">Subscription</h1>
      <div className="mt-4 rounded-lg border bg-white p-6">
        <div className="text-sm text-gray-500">Current plan</div>
        <div className="text-2xl font-bold">{plan?.name ?? 'Free'}</div>
        {plan && (
          <ul className="mt-4 space-y-1 text-sm text-gray-600">
            <li>
              Mailboxes: {mailboxCount} / {plan.maxMailboxes}
            </li>
            <li>Daily receive quota: {plan.dailyReceiveQuota}</li>
            <li>Daily send quota: {plan.dailySendQuota}</li>
            <li>Retention: {plan.retentionDays} days</li>
          </ul>
        )}
        <Link
          href="/pricing"
          className="mt-5 inline-block rounded bg-brand px-4 py-2 text-sm text-white hover:bg-brand-dark"
        >
          Upgrade with crypto
        </Link>
      </div>
    </div>
  );
}
