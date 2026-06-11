import Link from 'next/link';
import { prisma, type Prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const where: Prisma.AuditLogWhereInput = q
    ? {
        OR: [
          { action: { contains: q, mode: 'insensitive' } },
          { entity: { contains: q, mode: 'insensitive' } },
          { actor: { email: { contains: q, mode: 'insensitive' } } },
        ],
      }
    : {};

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { email: true } } },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (p > 1) params.set('page', String(p));
    const s = params.toString();
    return s ? `?${s}` : '';
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit log</h1>
        <p className="mt-1 text-sm text-gray-500">Every privileged action, newest first.</p>
      </div>

      <form className="flex items-center gap-2" action="/admin/audit">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search action, entity, or actor…"
          className="w-72 rounded-lg border px-3 py-1.5 text-sm"
        />
        <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">Search</button>
        {q && (
          <a href="/admin/audit" className="text-xs text-gray-400 hover:underline">
            clear
          </a>
        )}
        <span className="ml-auto text-sm text-gray-400">{total} entries</span>
      </form>

      <div className="overflow-hidden rounded-xl border bg-white">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-400">No audit entries.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="p-3">Action</th>
                <th className="p-3">Entity</th>
                <th className="p-3">Actor</th>
                <th className="p-3">When</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="p-3 font-mono text-xs text-gray-700">{a.action}</td>
                  <td className="p-3 text-xs text-gray-500">
                    {a.entity ?? '—'}
                    {a.entityId && <span className="text-gray-300"> · {a.entityId.slice(0, 8)}</span>}
                  </td>
                  <td className="p-3 text-xs text-gray-500">{a.actor?.email ?? 'system'}</td>
                  <td className="p-3 text-xs text-gray-400">{new Date(a.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/admin/audit${qs(page - 1)}`} className="rounded border px-3 py-1 hover:bg-gray-50">
                ← Prev
              </Link>
            )}
            {page < pages && (
              <Link href={`/admin/audit${qs(page + 1)}`} className="rounded border px-3 py-1 hover:bg-gray-50">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
