import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { ModuleActionForm } from '@/components/ModuleActionForm';
import { createAdZone, createAd, toggleAd } from '../module-actions';

export const dynamic = 'force-dynamic';

export default async function AdminAdsPage() {
  await requireAdmin();
  const zones = await prisma.adZone.findMany({
    orderBy: { createdAt: 'desc' },
    include: { ads: { include: { _count: { select: { events: true } } } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ads</h1>
        <p className="mt-1 text-sm text-gray-500">
          Zones are placement slots; ads render into them with weighted rotation.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">New zone</h2>
          <ModuleActionForm action={createAdZone} submitLabel="Create zone">
            <input name="key" placeholder="zone key (e.g. home_top)" className="w-full rounded border px-2 py-1.5 text-sm" />
            <input name="name" placeholder="Zone name" className="w-full rounded border px-2 py-1.5 text-sm" />
          </ModuleActionForm>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">New ad</h2>
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
        </div>
      </div>

      <div className="space-y-4">
        {zones.map((z) => (
          <div key={z.id} className="rounded-lg border bg-white p-4">
            <div className="font-semibold">
              {z.name} <code className="text-xs text-gray-400">{z.key}</code>
            </div>
            <ul className="mt-2 divide-y text-sm">
              {z.ads.length === 0 && <li className="py-2 text-gray-400">No ads</li>}
              {z.ads.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <span>
                    {a.name} · weight {a.weight} · {a._count.events} events
                  </span>
                  <form action={toggleAd}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className={a.isActive ? 'text-green-600' : 'text-gray-400'}>
                      {a.isActive ? 'Active' : 'Paused'}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
