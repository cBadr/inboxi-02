import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { dailyEvents, dailyInbound, dailyOutbound, seriesTotal } from '@/lib/timeseries';
import { BarChart, TrendCard } from '@/components/Charts';

export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90];

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.range)) ? Number(sp.range) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [eventsSeries, inboundSeries, outboundSeries, byType, topPaths, adAgg, recent] =
    await Promise.all([
      dailyEvents(days),
      dailyInbound(days),
      dailyOutbound(days),
      prisma.analyticsEvent.groupBy({
        by: ['type'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.analyticsEvent.groupBy({
        by: ['path'],
        where: { createdAt: { gte: since }, path: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { path: 'desc' } },
        take: 8,
      }),
      prisma.adEvent.groupBy({
        by: ['type'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.analyticsEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics &amp; Monitoring</h1>
          <p className="mt-1 text-sm text-gray-500">First-party events (privacy-friendly).</p>
        </div>
        <div className="flex rounded-lg border p-0.5 text-sm">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/admin/analytics?range=${r}`}
              className={`rounded-md px-3 py-1 transition ${days === r ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {r}d
            </Link>
          ))}
        </div>
      </div>

      {/* trend cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <TrendCard label={`Events (${days}d)`} total={seriesTotal(eventsSeries)} data={eventsSeries} color="#f59e0b" />
        <TrendCard label={`Messages in (${days}d)`} total={seriesTotal(inboundSeries)} data={inboundSeries} color="#6366f1" />
        <TrendCard label={`Sent (${days}d)`} total={seriesTotal(outboundSeries)} data={outboundSeries} color="#10b981" />
      </div>

      {/* events over time */}
      <div className="rounded-xl border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">Events — last {days} days</h2>
        <BarChart data={eventsSeries} color="#f59e0b" />
      </div>

      {/* breakdowns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">By event type</h2>
          {byType.length === 0 && adAgg.length === 0 ? (
            <p className="text-sm text-gray-400">No events in this range.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {byType.map((t) => (
                <li key={t.type} className="flex items-center justify-between">
                  <span className="text-gray-700">{t.type}</span>
                  <span className="font-semibold">{t._count._all}</span>
                </li>
              ))}
              {adAgg.map((t) => (
                <li key={`ad-${t.type}`} className="flex items-center justify-between text-gray-500">
                  <span>ad · {t.type}</span>
                  <span className="font-semibold">{t._count._all}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">Top paths</h2>
          {topPaths.length === 0 ? (
            <p className="text-sm text-gray-400">No path data.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {topPaths.map((p) => (
                <li key={p.path} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-mono text-xs text-gray-700">{p.path}</span>
                  <span className="shrink-0 font-semibold">{p._count._all}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* recent events */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">Recent events</h2>
        <table className="w-full overflow-hidden rounded-xl border bg-white text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-400">
            <tr>
              <th className="p-2">Type</th>
              <th className="p-2">Path</th>
              <th className="p-2">When</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {recent.map((e) => (
              <tr key={e.id}>
                <td className="p-2">{e.type}</td>
                <td className="p-2 font-mono text-xs">{e.path ?? '—'}</td>
                <td className="p-2 text-xs text-gray-400">{e.createdAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
