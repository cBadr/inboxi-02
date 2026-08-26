import Link from 'next/link';
import { prisma, type Prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { requestIp } from '@/lib/request-ip';
import { AUDIT, writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function AdminMailSearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    domainId?: string;
    from?: string;
    to?: string;
    hasAttachments?: string;
    page?: string;
  }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const domainId = (sp.domainId ?? '').trim();
  const from = (sp.from ?? '').trim();
  const to = (sp.to ?? '').trim();
  const hasAttachments =
    sp.hasAttachments === '1' ? true : sp.hasAttachments === '0' ? false : undefined;

  // `?from=x` would otherwise reach Prisma as an Invalid Date and throw, and a
  // bare `to=2026-08-26` means midnight — which silently drops that whole day
  // from a search the operator believes includes it.
  const parseDay = (value: string, endOfDay: boolean): Date | null => {
    if (!value) return null;
    const d = new Date(endOfDay ? `${value}T23:59:59.999` : value);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const fromDate = parseDay(from, false);
  const toDate = parseDay(to, true);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  // A search only "counts" — and only gets audited — once at least one filter is set.
  // Without this, every open of the page would otherwise be a full-table scan and a
  // free audit-log row for looking at nothing.
  const hasQuery =
    q.length > 0 ||
    domainId.length > 0 ||
    from.length > 0 ||
    to.length > 0 ||
    hasAttachments !== undefined;

  const domains = await prisma.domain.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const where: Prisma.MessageWhereInput = {
    ...(domainId ? { domainId } : {}),
    ...(hasAttachments !== undefined
      ? { attachments: hasAttachments ? { some: {} } : { none: {} } }
      : {}),
    ...(fromDate || toDate
      ? {
          receivedAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { fromAddress: { contains: q, mode: 'insensitive' as const } },
            { toAddress: { contains: q, mode: 'insensitive' as const } },
            { subject: { contains: q, mode: 'insensitive' as const } },
            // textBody has no index — this branch of the OR is a full table scan.
            // Acceptable for an admin-only, low-QPS tool; add a trigram/GIN index
            // (or move to a search engine) if this page ever needs to be fast.
            { textBody: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  let total = 0;
  let rows: Array<{
    id: string;
    domainId: string;
    domain: { name: string };
    fromAddress: string;
    toAddress: string;
    subject: string | null;
    snippet: string | null;
    receivedAt: Date;
    _count: { attachments: number };
  }> = [];

  if (hasQuery) {
    [total, rows] = await Promise.all([
      prisma.message.count({ where }),
      prisma.message.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          domainId: true,
          domain: { select: { name: true } },
          fromAddress: true,
          toAddress: true,
          subject: true,
          snippet: true,
          receivedAt: true,
          _count: { select: { attachments: true } },
        },
      }),
    ]);

    // One audit row per search, not per result — this is the price of looking
    // across every customer's mail at once.
    await writeAudit({
      // Without an actor this row records that someone read every customer's
      // mail, and not who — which is the whole point of logging it.
      actorId: admin.id,
      action: AUDIT.MAIL_SEARCH,
      ipAddress: await requestIp(),
      metadata: { q, domainId, from, to, resultCount: total },
    });
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (next: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const merged = {
      q,
      domainId,
      from,
      to,
      hasAttachments: sp.hasAttachments ?? '',
      page,
      ...next,
    };
    if (merged.q) p.set('q', String(merged.q));
    if (merged.domainId) p.set('domainId', String(merged.domainId));
    if (merged.from) p.set('from', String(merged.from));
    if (merged.to) p.set('to', String(merged.to));
    if (merged.hasAttachments) p.set('hasAttachments', String(merged.hasAttachments));
    if (merged.page && Number(merged.page) > 1) p.set('page', String(merged.page));
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mail search</h1>
        <p className="mt-1 text-sm text-gray-500">
          Search every mailbox across every domain. Each search is logged.
        </p>
      </div>

      {/* filters */}
      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3"
        action="/admin/mail"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Query</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="from / to / subject / body…"
            className="w-56 rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Domain</label>
          <select
            name="domainId"
            defaultValue={domainId}
            className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          >
            <option value="">All domains</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">From</label>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">To</label>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Attachments</label>
          <select
            name="hasAttachments"
            defaultValue={sp.hasAttachments ?? ''}
            className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          >
            <option value="">Any</option>
            <option value="1">Has attachments</option>
            <option value="0">No attachments</option>
          </select>
        </div>
        <button className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
          Search
        </button>
      </form>

      {/* results */}
      {!hasQuery ? (
        <div className="rounded-xl border bg-white p-12 text-center text-sm text-gray-500">
          Set at least one filter to search. Nothing is fetched — or logged — until you do.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-white">
            {rows.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-500">No messages match.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {rows.map((m) => (
                  <li key={m.id} className="px-4 py-3">
                    <Link
                      href={`/admin/inboxes/${m.domainId}/${m.id}`}
                      className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3"
                    >
                      <span className="shrink-0 text-xs text-gray-400 sm:w-36">
                        {new Date(m.receivedAt).toLocaleString()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-gray-900">
                            {m.subject || '(no subject)'}
                          </span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
                              {m.domain.name}
                            </span>
                            {m._count.attachments > 0 && (
                              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-600">
                                {m._count.attachments} file
                                {m._count.attachments === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                          <span className="font-mono">{m.fromAddress}</span>
                          <span>→</span>
                          <span className="font-mono">{m.toAddress}</span>
                        </div>
                        {m.snippet && (
                          <div className="mt-1 truncate text-xs text-gray-400">{m.snippet}</div>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* pagination */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">
              Page {page} of {pages} · {total} message{total === 1 ? '' : 's'} total
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/admin/mail${qs({ page: page - 1 })}`}
                  className="rounded border px-3 py-1 hover:bg-gray-50"
                >
                  ← Prev
                </Link>
              )}
              {page < pages && (
                <Link
                  href={`/admin/mail${qs({ page: page + 1 })}`}
                  className="rounded border px-3 py-1 hover:bg-gray-50"
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
