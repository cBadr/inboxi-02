import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DashboardOverview() {
  const user = await requireUser();
  const [mailboxCount, messageCount, sub] = await Promise.all([
    prisma.mailbox.count({ where: { userId: user.id } }),
    prisma.message.count({ where: { mailbox: { userId: user.id } } }),
    prisma.subscription.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { plan: true },
      orderBy: { startedAt: 'desc' },
    }),
  ]);

  const stats = [
    { label: 'Mailboxes', value: mailboxCount, href: '/dashboard/mailboxes' },
    { label: 'Messages', value: messageCount, href: '/dashboard/mailboxes' },
    { label: 'Plan', value: sub?.plan.name ?? 'Free', href: '/dashboard/subscription' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">Welcome{user.name ? `, ${user.name}` : ''}</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-lg border bg-white p-5 shadow-sm hover:border-brand"
          >
            <div className="text-xs uppercase tracking-wide text-gray-400">{s.label}</div>
            <div className="mt-1 text-2xl font-bold">{s.value}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
