import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { addBlock, removeBlock, resolveReport, blockFromReport } from '../security-actions';

export const dynamic = 'force-dynamic';

const REPORT_BADGE: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-700',
  RESOLVED: 'bg-green-100 text-green-700',
  DISMISSED: 'bg-gray-100 text-gray-500',
};

export default async function AdminSecurityPage() {
  await requireAdmin();
  const [blocks, reports, openCount] = await Promise.all([
    prisma.blocklist.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.abuseReport.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 100 }),
    prisma.abuseReport.count({ where: { status: 'OPEN' } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Security &amp; Abuse</h1>
        <p className="mt-1 text-sm text-gray-500">
          Block IPs, domains, or addresses, and triage abuse reports. Blocked recipients are refused
          at send time.
        </p>
      </div>

      {/* blocklist */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-800">Blocklist</h2>
        <form action={addBlock} className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
          <select name="kind" className="rounded border px-2 py-1.5 text-sm" defaultValue="EMAIL">
            <option value="EMAIL">Email</option>
            <option value="DOMAIN">Domain</option>
            <option value="IP">IP</option>
          </select>
          <input name="value" placeholder="value (e.g. spammer@bad.com)" className="w-64 rounded border px-2 py-1.5 text-sm" />
          <input name="reason" placeholder="reason (optional)" className="w-48 rounded border px-2 py-1.5 text-sm" />
          <button className="rounded-lg bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark">Add block</button>
        </form>
        <div className="overflow-hidden rounded-xl border bg-white">
          {blocks.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-400">Nothing blocked.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-400">
                <tr>
                  <th className="p-3">Kind</th>
                  <th className="p-3">Value</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Added</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {blocks.map((b) => (
                  <tr key={b.id}>
                    <td className="p-3">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{b.kind}</span>
                    </td>
                    <td className="p-3 font-mono text-xs">{b.value}</td>
                    <td className="p-3 text-xs text-gray-500">{b.reason ?? '—'}</td>
                    <td className="p-3 text-xs text-gray-400">{new Date(b.createdAt).toLocaleDateString()}</td>
                    <td className="p-3 text-right">
                      <form action={removeBlock}>
                        <input type="hidden" name="id" value={b.id} />
                        <button className="text-xs text-red-500 hover:underline">Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* abuse reports */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-800">
          Abuse reports {openCount > 0 && <span className="text-amber-600">· {openCount} open</span>}
        </h2>
        <div className="overflow-hidden rounded-xl border bg-white">
          {reports.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-400">No reports.</p>
          ) : (
            <ul className="divide-y">
              {reports.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                  <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${REPORT_BADGE[r.status] ?? ''}`}>
                    {r.status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{r.targetType}</span>{' '}
                      <span className="font-mono">{r.targetValue}</span>
                    </div>
                    <div className="text-xs text-gray-500">{r.reason}</div>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                  {r.status === 'OPEN' && (
                    <div className="flex items-center gap-2">
                      <form action={blockFromReport}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                          Block + resolve
                        </button>
                      </form>
                      <form action={resolveReport}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="DISMISSED" />
                        <button className="rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">Dismiss</button>
                      </form>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
