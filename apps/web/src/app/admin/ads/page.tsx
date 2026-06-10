import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { ModuleActionForm } from '@/components/ModuleActionForm';
import { createAdZone, createAd, toggleAd, deleteAd, seedDemoAds } from '../module-actions';

export const dynamic = 'force-dynamic';

export default async function AdminAdsPage() {
  await requireAdmin();

  const [zones, eventGroups, uniqueRows] = await Promise.all([
    prisma.adZone.findMany({
      orderBy: { createdAt: 'desc' },
      include: { ads: { orderBy: { createdAt: 'desc' } } },
    }),
    prisma.adEvent.groupBy({ by: ['adId', 'type'], _count: { _all: true } }),
    // Distinct viewers per ad (impressions with an ipHash).
    prisma.$queryRaw<Array<{ adId: string; visitors: bigint }>>`
      SELECT "adId", COUNT(DISTINCT "ipHash") AS visitors
      FROM "AdEvent"
      WHERE "type" = 'impression' AND "ipHash" IS NOT NULL
      GROUP BY "adId"
    `.catch(() => []),
  ]);

  const stat = (adId: string, type: string) =>
    eventGroups.find((g) => g.adId === adId && g.type === type)?._count._all ?? 0;
  const visitorsOf = (adId: string) =>
    Number(uniqueRows.find((r) => r.adId === adId)?.visitors ?? 0);

  const allAds = zones.flatMap((z) => z.ads);
  const totalImpressions = allAds.reduce((s, a) => s + stat(a.id, 'impression'), 0);
  const totalClicks = allAds.reduce((s, a) => s + stat(a.id, 'click'), 0);
  const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ads</h1>
          <p className="mt-1 text-sm text-gray-500">
            Zones are placement slots; ads render with weighted rotation and track impressions,
            unique visitors, and clicks.
          </p>
        </div>
        {allAds.length === 0 && (
          <form action={seedDemoAds}>
            <button className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
              ✨ Seed 3 demo ads
            </button>
          </form>
        )}
      </div>

      {/* overview stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active ads" value={allAds.filter((a) => a.isActive).length} />
        <StatCard label="Impressions" value={totalImpressions.toLocaleString()} />
        <StatCard label="Clicks" value={totalClicks.toLocaleString()} />
        <StatCard label="Overall CTR" value={`${overallCtr.toFixed(2)}%`} accent />
      </div>

      {/* create forms */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-800">New zone</h2>
          <ModuleActionForm action={createAdZone} submitLabel="Create zone">
            <input name="key" placeholder="zone key (e.g. home_top)" className="w-full rounded border px-2 py-1.5 text-sm" />
            <input name="name" placeholder="Zone name" className="w-full rounded border px-2 py-1.5 text-sm" />
          </ModuleActionForm>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-800">New ad</h2>
          {zones.length === 0 ? (
            <p className="text-sm text-gray-400">Create a zone first.</p>
          ) : (
            <ModuleActionForm action={createAd} submitLabel="Create ad">
              <select name="zoneId" className="w-full rounded border px-2 py-1.5 text-sm">
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} ({z.key})
                  </option>
                ))}
              </select>
              <input name="name" placeholder="Ad name" className="w-full rounded border px-2 py-1.5 text-sm" />
              <input name="imageUrl" placeholder="Image URL (optional)" className="w-full rounded border px-2 py-1.5 text-sm" />
              <input name="targetUrl" placeholder="Target URL" className="w-full rounded border px-2 py-1.5 text-sm" />
              <input name="htmlContent" placeholder="or raw HTML" className="w-full rounded border px-2 py-1.5 text-sm" />
              <input name="weight" type="number" defaultValue={1} min={1} className="w-24 rounded border px-2 py-1.5 text-sm" />
            </ModuleActionForm>
          )}
        </div>
      </div>

      {/* zones + ads */}
      <div className="space-y-4">
        {zones.map((z) => (
          <div key={z.id} className="overflow-hidden rounded-xl border bg-white">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <div className="font-semibold text-gray-900">
                {z.name}{' '}
                <code className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                  {z.key}
                </code>
                {z.width && z.height && (
                  <span className="ml-2 text-xs text-gray-400">
                    {z.width}×{z.height}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400">{z.ads.length} ad(s)</span>
            </div>

            {z.ads.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-gray-400">No ads in this zone.</p>
            ) : (
              <ul className="divide-y">
                {z.ads.map((a) => {
                  const impressions = stat(a.id, 'impression');
                  const clicks = stat(a.id, 'click');
                  const visitors = visitorsOf(a.id);
                  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                      {/* preview */}
                      <div className="h-12 w-28 shrink-0 overflow-hidden rounded border bg-gray-50">
                        {a.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.imageUrl} alt={a.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
                            {a.htmlContent ? 'HTML' : 'No preview'}
                          </div>
                        )}
                      </div>

                      {/* name + target */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-gray-900">{a.name}</span>
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
                            weight {a.weight}
                          </span>
                        </div>
                        {a.targetUrl && (
                          <a
                            href={a.targetUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-xs text-brand hover:underline"
                          >
                            {a.targetUrl}
                          </a>
                        )}
                      </div>

                      {/* counters */}
                      <div className="flex items-center gap-5 text-center">
                        <Metric label="Impressions" value={impressions.toLocaleString()} />
                        <Metric label="Visitors" value={visitors.toLocaleString()} />
                        <Metric label="Clicks" value={clicks.toLocaleString()} />
                        <Metric label="CTR" value={`${ctr.toFixed(1)}%`} highlight />
                      </div>

                      {/* actions */}
                      <div className="flex items-center gap-2">
                        <form action={toggleAd}>
                          <input type="hidden" name="id" value={a.id} />
                          <button
                            className={`rounded px-2.5 py-1 text-xs ${a.isActive ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                          >
                            {a.isActive ? '● Active' : '○ Paused'}
                          </button>
                        </form>
                        <form action={deleteAd}>
                          <input type="hidden" name="id" value={a.id} />
                          <button className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50">
                            Delete
                          </button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ? 'text-brand' : 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className={`text-sm font-bold ${highlight ? 'text-brand' : 'text-gray-900'}`}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}
