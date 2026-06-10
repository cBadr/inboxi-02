import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminAnalyticsPage() {
  await requireAdmin();
  const [byType, recent, adAgg] = await Promise.all([
    prisma.analyticsEvent.groupBy({ by: ['type'], _count: { _all: true } }),
    prisma.analyticsEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.adEvent.groupBy({ by: ['type'], _count: { _all: true } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics & Monitoring</h1>
        <p className="mt-1 text-sm text-gray-500">First-party events (privacy-friendly).</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {byType.map((t) => (
          <div key={t.type} className="rounded-lg border bg-white p-4">
            <div className="text-xs uppercase text-gray-400">{t.type}</div>
            <div className="text-2xl font-bold">{t._count._all}</div>
          </div>
        ))}
        {adAgg.map((t) => (
          <div key={`ad-${t.type}`} className="rounded-lg border bg-white p-4">
            <div className="text-xs uppercase text-gray-400">ad {t.type}</div>
            <div className="text-2xl font-bold">{t._count._all}</div>
          </div>
        ))}
        {byType.length === 0 && adAgg.length === 0 && (
          <p className="text-sm text-gray-500">No events recorded yet.</p>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Recent events</h2>
        <table className="w-full overflow-hidden rounded-lg border bg-white text-sm">
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
