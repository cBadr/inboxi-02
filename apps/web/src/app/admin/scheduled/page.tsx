import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { cancelScheduled } from '../scheduled-actions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  PROCESSING: 'bg-blue-100 text-blue-700',
  SENT: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELED: 'bg-amber-100 text-amber-700',
};

const TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'PROCESSING', label: 'Processing' },
  { key: 'SENT', label: 'Sent' },
  { key: 'FAILED', label: 'Failed' },
  { key: 'CANCELED', label: 'Canceled' },
];

export default async function AdminScheduledPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status ?? 'all';
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const where = status !== 'all' ? { status } : {};

  const [total, rows] = await Promise.all([
    prisma.scheduledMessage.count({ where }),
    prisma.scheduledMessage.findMany({
      where,
      orderBy: { scheduleAt: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  // ScheduledMessage.userId is a plain string column, not a Prisma relation —
  // `include: { user: true }` does not compile here. Resolve owners with one
  // extra query and join them in memory instead.
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u.email]));

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (next: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const merged = { status, page, ...next };
    if (merged.status && merged.status !== 'all') p.set('status', String(merged.status));
    if (merged.page && Number(merged.page) > 1) p.set('page', String(merged.page));
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Scheduled sends</h1>
        <p className="mt-1 text-sm text-gray-500">
          Composed messages waiting for their send time — a cron job claims PENDING rows every
          minute. Cancel here before it does.
        </p>
      </div>

      <div className="flex flex-wrap rounded-lg border p-0.5 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/scheduled${qs({ status: t.key, page: 1 })}`}
            className={`rounded-md px-3 py-1 transition ${status === t.key ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">No scheduled messages found.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[m.status] ?? 'bg-gray-100'}`}
                  >
                    {m.status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-gray-900">
                        {m.subject || '(no subject)'}
                      </span>
                      <span className="shrink-0 text-xs text-gray-400">
                        {m.scheduleAt.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                      <span className="font-mono">{m.fromAddress}</span>
                      <span>·</span>
                      <span>{userById.get(m.userId) ?? m.userId}</span>
                      <span>·</span>
                      <span>
                        {m.sentCount}/{m.totalCount} sent
                        {m.failedCount > 0 ? `, ${m.failedCount} failed` : ''}
                      </span>
                    </div>
                    {m.lastError && (
                      <div className="mt-1 truncate text-xs text-red-500" title={m.lastError}>
                        ⚠ {m.lastError}
                      </div>
                    )}
                  </div>
                  {m.status === 'PENDING' && (
                    <form action={cancelScheduled} className="shrink-0">
                      <input type="hidden" name="id" value={m.id} />
                      <button className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                        Cancel
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">
            Page {page} of {pages} · {total} message(s)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/scheduled${qs({ page: page - 1 })}`}
                className="rounded border px-3 py-1 hover:bg-gray-50"
              >
                ← Prev
              </Link>
            )}
            {page < pages && (
              <Link
                href={`/admin/scheduled${qs({ page: page + 1 })}`}
                className="rounded border px-3 py-1 hover:bg-gray-50"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
