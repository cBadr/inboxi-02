import Link from 'next/link';
import { prisma, type OutboundStatus } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { getOutboundStats } from '@/lib/sending-stats';
import { resendOutbound, deleteOutbound } from '../outbox-actions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const STATUS_BADGE: Record<string, string> = {
  SENT: 'bg-green-100 text-green-700',
  QUEUED: 'bg-gray-100 text-gray-600',
  SENDING: 'bg-blue-100 text-blue-700',
  DEFERRED: 'bg-amber-100 text-amber-700',
  BOUNCED: 'bg-orange-100 text-orange-700',
  COMPLAINED: 'bg-red-100 text-red-700',
  FAILED: 'bg-red-100 text-red-700',
  BLOCKED: 'bg-rose-100 text-rose-700',
};

const TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'SENT', label: 'Sent' },
  { key: 'FAILED', label: 'Failed' },
  { key: 'BOUNCED', label: 'Bounced' },
  { key: 'COMPLAINED', label: 'Complaints' },
  { key: 'BLOCKED', label: 'Blocked' },
  { key: 'QUEUED', label: 'Queued' },
];

const RESENDABLE = new Set(['FAILED', 'BOUNCED', 'DEFERRED', 'BLOCKED']);

export default async function AdminOutboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status ?? 'all';
  const q = (sp.q ?? '').trim();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const where = {
    ...(status !== 'all' ? { status: status as OutboundStatus } : {}),
    ...(q
      ? {
          OR: [
            { toAddress: { contains: q, mode: 'insensitive' as const } },
            { fromAddress: { contains: q, mode: 'insensitive' as const } },
            { subject: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [stats, total, rows] = await Promise.all([
    getOutboundStats(),
    prisma.outboundMessage.count({ where }),
    prisma.outboundMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (next: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const merged = { status, q, page, ...next };
    if (merged.status && merged.status !== 'all') p.set('status', String(merged.status));
    if (merged.q) p.set('q', String(merged.q));
    if (merged.page && Number(merged.page) > 1) p.set('page', String(merged.page));
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  const failPct = Math.round(stats.failureRate * 100);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Outbox</h1>
        <p className="mt-1 text-sm text-gray-500">
          Every message the platform sent — delivery status, transport, errors, and resend.
        </p>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Total" value={stats.total} />
        <Stat label="Sent" value={stats.byStatus.SENT ?? 0} tone="good" />
        <Stat label="Failed" value={stats.byStatus.FAILED ?? 0} tone={(stats.byStatus.FAILED ?? 0) > 0 ? 'bad' : 'default'} />
        <Stat label="Blocked" value={stats.byStatus.BLOCKED ?? 0} tone={(stats.byStatus.BLOCKED ?? 0) > 0 ? 'warn' : 'default'} />
        <Stat label="24h failure" value={`${failPct}%`} tone={failPct >= 20 ? 'bad' : failPct >= 5 ? 'warn' : 'good'} />
      </div>

      {/* filter + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-lg border p-0.5 text-sm">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/admin/outbox${qs({ status: t.key, page: 1 })}`}
              className={`rounded-md px-3 py-1 transition ${status === t.key ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
              {t.key !== 'all' && (
                <span className={`ml-1 text-xs ${status === t.key ? 'text-white/80' : 'text-gray-400'}`}>
                  {stats.byStatus[t.key] ?? 0}
                </span>
              )}
            </Link>
          ))}
        </div>
        <form className="ml-auto" action="/admin/outbox">
          {status !== 'all' && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search to / from / subject…"
            className="w-60 rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </form>
      </div>

      {/* list */}
      <div className="overflow-hidden rounded-xl border bg-white">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">No messages found.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[m.status] ?? 'bg-gray-100'}`}>
                    {m.status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/admin/outbox/${m.id}`}
                        className="truncate text-sm font-medium text-gray-900 hover:text-brand hover:underline"
                      >
                        {m.subject || '(no subject)'}
                      </Link>
                      <span className="shrink-0 text-xs text-gray-400">
                        {new Date(m.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                      <span className="font-mono">{m.fromAddress}</span>
                      <span>→</span>
                      <span className="font-mono">{m.toAddress}</span>
                      {m.transportType && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">
                          {m.transportType}
                        </span>
                      )}
                      {m.dkimSigned && <span className="text-green-600">DKIM</span>}
                      {m.attempts > 1 && <span>· {m.attempts} attempts</span>}
                    </div>
                    {m.lastError && (
                      <div className="mt-1 truncate text-xs text-red-500" title={m.lastError}>
                        ⚠ {m.lastError}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {RESENDABLE.has(m.status) && (
                      <form action={resendOutbound}>
                        <input type="hidden" name="id" value={m.id} />
                        <button className="rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                          Resend
                        </button>
                      </form>
                    )}
                    <form action={deleteOutbound}>
                      <input type="hidden" name="id" value={m.id} />
                      <button className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">
            Page {page} of {pages} · {total} message(s)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/admin/outbox${qs({ page: page - 1 })}`} className="rounded border px-3 py-1 hover:bg-gray-50">
                ← Prev
              </Link>
            )}
            {page < pages && (
              <Link href={`/admin/outbox${qs({ page: page + 1 })}`} className="rounded border px-3 py-1 hover:bg-gray-50">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const c =
    tone === 'good' ? 'text-green-600' : tone === 'warn' ? 'text-amber-600' : tone === 'bad' ? 'text-red-600' : 'text-gray-900';
  return (
    <div className="rounded-xl border bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${c}`}>{value}</div>
    </div>
  );
}
