import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { AdminComposer } from '@/components/admin/AdminComposer';

export const dynamic = 'force-dynamic';

export default async function AdminInboxesPage() {
  await requireAdmin();

  const [domains, unreadByDomain, lastByDomain, totals] = await Promise.all([
    prisma.domain.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { mailboxes: true, messages: true } },
        catchAllMailbox: { include: { _count: { select: { messages: true } } } },
      },
    }),
    prisma.message.groupBy({
      by: ['domainId'],
      where: { isRead: false },
      _count: { _all: true },
    }),
    prisma.message.groupBy({
      by: ['domainId'],
      _max: { receivedAt: true },
    }),
    prisma.message.count(),
  ]);

  const unreadMap = new Map(unreadByDomain.map((u) => [u.domainId, u._count._all]));
  const lastMap = new Map(lastByDomain.map((l) => [l.domainId, l._max.receivedAt]));
  const activeDomains = domains.filter((d) => d.isActive).map((d) => d.name);

  const totalMailboxes = domains.reduce((s, d) => s + d._count.mailboxes, 0);
  const totalUnread = unreadByDomain.reduce((s, u) => s + u._count._all, 0);
  const withCatchAll = domains.filter((d) => d.catchAllMailbox).length;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mailboxes</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Every domain&apos;s mail — including the catch-all that receives anything sent to an
            unprovisioned address. Read all of it here, or compose a new message from any address.
          </p>
        </div>
        <AdminComposer domains={activeDomains} triggerLabel="Compose" />
      </div>

      {/* summary stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Domains" value={domains.length} />
        <SummaryCard label="Total messages" value={totals} />
        <SummaryCard label="Unread" value={totalUnread} accent={totalUnread > 0} />
        <SummaryCard label="Mailboxes" value={totalMailboxes} />
      </div>

      {/* domain cards */}
      <div className="mt-6 space-y-3">
        {domains.length === 0 && (
          <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-gray-500">
            No domains yet. Add one under Domains &amp; DNS.
          </div>
        )}
        {domains.map((d) => {
          const unread = unreadMap.get(d.id) ?? 0;
          const last = lastMap.get(d.id);
          return (
            <Link
              key={d.id}
              href={`/admin/inboxes/${d.id}`}
              className="group flex items-center gap-4 rounded-xl border bg-white p-4 transition hover:border-brand/40 hover:shadow-sm"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-10 5L2 7" />
                </svg>
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-sm font-medium text-gray-900">
                    {d.name}
                  </span>
                  {!d.isActive && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
                      inactive
                    </span>
                  )}
                  {unread > 0 && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                      {unread} new
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                  <span>{d._count.messages} messages</span>
                  <span>·</span>
                  <span>{d._count.mailboxes} mailboxes</span>
                  <span>·</span>
                  <span>
                    {d.catchAllMailbox ? (
                      <span className="text-gray-500">
                        catch-all {d.catchAllMailbox._count.messages}
                      </span>
                    ) : (
                      <span className="text-amber-600">no catch-all</span>
                    )}
                  </span>
                </div>
              </div>

              <div className="hidden shrink-0 text-right sm:block">
                <div className="text-[11px] uppercase tracking-wide text-gray-300">Last mail</div>
                <div className="text-xs text-gray-500">{last ? timeAgo(last) : '—'}</div>
              </div>
              <svg
                width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                className="shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-brand"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Catch-all coverage: {withCatchAll}/{domains.length} domains.
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
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

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}
