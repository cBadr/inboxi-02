import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminOverview() {
  await requireAdmin();
  const [users, domains, mailboxes, messages, anon, sent, blocked, activeSubs, attentionDomains] =
    await Promise.all([
      prisma.user.count(),
      prisma.domain.count(),
      prisma.mailbox.count(),
      prisma.message.count(),
      prisma.anonymousSession.count(),
      prisma.outboundMessage.count({ where: { status: 'SENT' } }),
      prisma.outboundMessage.count({ where: { status: 'BLOCKED' } }),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.domain.findMany({
        where: { dnsStatus: { in: ['FAILED', 'PENDING'] } },
        select: { id: true, name: true, dnsStatus: true },
        take: 5,
      }),
    ]);

  const stats = [
    { label: 'Users', value: users },
    { label: 'Active subs', value: activeSubs },
    { label: 'Domains', value: domains },
    { label: 'Mailboxes', value: mailboxes },
    { label: 'Messages', value: messages },
    { label: 'Anon sessions', value: anon },
    { label: 'Sent', value: sent },
    { label: 'Blocked (abuse)', value: blocked },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">Platform control center.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border bg-white p-5 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-400">{s.label}</div>
            <div className="mt-1 text-2xl font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-white p-5">
        <h2 className="text-sm font-semibold">Domains needing attention</h2>
        {attentionDomains.length === 0 ? (
          <p className="mt-2 text-sm text-green-600">All domains verified ✓</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {attentionDomains.map((d) => (
              <li key={d.id} className="flex items-center justify-between">
                <Link href={`/admin/domains/${d.id}`} className="font-mono text-brand hover:underline">
                  {d.name}
                </Link>
                <span className="text-xs text-amber-600">{d.dnsStatus}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
