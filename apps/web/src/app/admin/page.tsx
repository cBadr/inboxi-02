import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { dailyInbound, dailyOutbound, dailyUsers, dailyEvents, seriesTotal } from '@/lib/timeseries';
import { TrendCard, BarChart } from '@/components/Charts';
import { getOutboundStats } from '@/lib/sending-stats';
import { readOutboundSpool } from '@/lib/mail-spool';

export const dynamic = 'force-dynamic';

export default async function AdminOverview() {
  await requireAdmin();
  const [
    users,
    domains,
    mailboxes,
    messages,
    anon,
    blocked,
    activeSubs,
    attentionDomains,
    inbound30,
    outbound30,
    users30,
    events30,
    recentAudit,
    outboundStats,
    spool,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.domain.count(),
    prisma.mailbox.count(),
    prisma.message.count(),
    prisma.anonymousSession.count(),
    prisma.outboundMessage.count({ where: { status: 'BLOCKED' } }),
    prisma.subscription.count({ where: { status: 'ACTIVE' } }),
    prisma.domain.findMany({
      where: { dnsStatus: { in: ['FAILED', 'PENDING'] } },
      select: { id: true, name: true, dnsStatus: true },
      take: 5,
    }),
    dailyInbound(30),
    dailyOutbound(30),
    dailyUsers(30),
    dailyEvents(30),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { actor: { select: { email: true } } },
    }),
    getOutboundStats(),
    readOutboundSpool(), // one disk read for the whole page render
  ]);

  const stats = [
    { label: 'Users', value: users },
    { label: 'Active subs', value: activeSubs },
    { label: 'Domains', value: domains },
    { label: 'Mailboxes', value: mailboxes },
    { label: 'Messages', value: messages },
    { label: 'Anon sessions', value: anon },
    // "Sent" pre-dates the SENT-on-accept fix: historical rows here were never confirmed
    // delivered. Queued is what's still genuinely in flight right now.
    { label: 'Sent (status)', value: outboundStats.byStatus.SENT ?? 0 },
    { label: 'Queued', value: outboundStats.queued },
    { label: 'Blocked (abuse)', value: blocked },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">Platform control center.</p>
      </div>

      {/* 30-day trends */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TrendCard label="Messages received (30d)" total={seriesTotal(inbound30)} data={inbound30} color="#6366f1" />
        <TrendCard label="Sent (30d)" total={seriesTotal(outbound30)} data={outbound30} color="#10b981" />
        <TrendCard label="New users (30d)" total={seriesTotal(users30)} data={users30} color="#0ea5e9" />
        <TrendCard label="Events (30d)" total={seriesTotal(events30)} data={events30} color="#f59e0b" />
      </div>

      {/* daily inbound chart */}
      <div className="rounded-xl border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">Messages received — last 30 days</h2>
        <BarChart data={inbound30} color="#6366f1" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border bg-white p-5 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-400">{s.label}</div>
            <div
              className={`mt-1 text-2xl font-bold ${s.label === 'Queued' ? 'text-amber-600' : ''}`}
            >
              {s.value}
            </div>
          </div>
        ))}
        {spool.available && (
          <Link
            href="/admin/delivery"
            className={`rounded-lg border p-5 shadow-sm ${
              spool.depth > 1000 || (spool.oldestMinutes ?? 0) > 60
                ? 'border-red-300 bg-red-50'
                : 'bg-white'
            }`}
          >
            <div className="text-xs uppercase tracking-wide text-gray-400">MTA queue depth</div>
            <div className="mt-1 text-2xl font-bold">{spool.depth.toLocaleString()}</div>
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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

        <div className="rounded-lg border bg-white p-5">
          <h2 className="text-sm font-semibold">Recent admin activity</h2>
          {recentAudit.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">No activity recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {recentAudit.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-xs text-gray-700">{a.action}</span>
                    {a.entity && <span className="ml-1 text-xs text-gray-400">· {a.entity}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {a.actor?.email ? `${a.actor.email.split('@')[0]} · ` : ''}
                    {timeAgo(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
