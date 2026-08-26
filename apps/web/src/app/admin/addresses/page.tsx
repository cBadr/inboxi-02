import Link from 'next/link';
import { prisma, Prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { writeAudit, AUDIT } from '@/lib/audit';
import { requestIp } from '@/lib/request-ip';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type AddressType = 'all' | 'mailbox' | 'catchall' | 'anonymous';
type SortMode = 'recent' | 'count';

export default async function AdminAddressesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    domainId?: string;
    type?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const domainId = (sp.domainId ?? '').trim();
  const type: AddressType =
    sp.type === 'mailbox' || sp.type === 'catchall' || sp.type === 'anonymous' ? sp.type : 'all';
  const sort: SortMode = sp.sort === 'count' ? 'count' : 'recent';
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const domains = await prisma.domain.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  // Every address that has ever received mail via the dedicated-mailbox path
  // is exactly the set of addresses with a Mailbox row (address is @@unique).
  // Measured on production: 6 mailboxes total (see wave contract §4) — cheap
  // enough to load in full, which is what lets us apply the `type` filter and
  // compute the summary cards *before* pagination, not just on the current
  // page. Selecting the owner here doubles this as one of the two enrichment
  // queries for the page rows.
  const mailboxRows = await prisma.mailbox.findMany({
    select: { address: true, userId: true, user: { select: { email: true } } },
  });
  const mailboxByAddress = new Map(mailboxRows.map((m) => [m.address, m]));
  const mailboxAddressList = mailboxRows.map((m) => m.address);

  // The raw summary/total queries classify by joining Mailbox rather than
  // binding every mailbox address: two NOT IN lists per request would grow
  // with the business and eventually hit Postgres's bind-parameter ceiling.
  // The Prisma `where` below still binds the list — acceptable at today's six
  // mailboxes, and the first thing to move to raw SQL when that changes.
  const mailboxInSql = Prisma.sql`EXISTS (SELECT 1 FROM "Mailbox" mb WHERE mb."address" = "Message"."toAddress")`;
  const mailboxNotInSql = Prisma.sql`NOT EXISTS (SELECT 1 FROM "Mailbox" mb WHERE mb."address" = "Message"."toAddress")`;

  const andConditions: Prisma.MessageWhereInput[] = [];
  if (domainId) andConditions.push({ domainId });
  if (q) andConditions.push({ toAddress: { contains: q, mode: 'insensitive' as const } });
  if (type === 'mailbox') {
    andConditions.push({ toAddress: { in: mailboxAddressList } });
  } else if (type === 'anonymous') {
    andConditions.push({
      toAddress: { notIn: mailboxAddressList },
      anonymousSessionId: { not: null },
    });
  } else if (type === 'catchall') {
    andConditions.push({ toAddress: { notIn: mailboxAddressList }, anonymousSessionId: null });
  }
  const where: Prisma.MessageWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

  // Raw-SQL mirrors of the same filters, needed because groupBy has no total
  // count and Prisma can't express a FILTER(WHERE …) aggregate for the
  // per-type summary cards. Keep these in sync with `andConditions` above.
  const baseSqlConditions: Prisma.Sql[] = [];
  if (domainId) baseSqlConditions.push(Prisma.sql`"domainId" = ${domainId}`);
  if (q) baseSqlConditions.push(Prisma.sql`"toAddress" ILIKE ${`%${q}%`}`);
  let typeSql: Prisma.Sql | null = null;
  if (type === 'mailbox') typeSql = mailboxInSql;
  else if (type === 'anonymous')
    typeSql = Prisma.sql`${mailboxNotInSql} AND "anonymousSessionId" IS NOT NULL`;
  else if (type === 'catchall')
    typeSql = Prisma.sql`${mailboxNotInSql} AND "anonymousSessionId" IS NULL`;

  const totalSqlConditions = [...baseSqlConditions, ...(typeSql ? [typeSql] : [])];
  const totalWhereSql =
    totalSqlConditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(totalSqlConditions, ' AND ')}`
      : Prisma.empty;
  const baseWhereSql =
    baseSqlConditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(baseSqlConditions, ' AND ')}`
      : Prisma.empty;

  // groupBy() scans every matching Message row to fold it down to one row per
  // address — cheap at today's scale (174 messages in production) but it
  // gets heavy as mail volume grows, since there's no way to index a GROUP BY
  // itself. If this page ever needs to be fast at scale, replace it with a
  // materialized view (or a periodically-refreshed summary table) keyed on
  // toAddress instead of scanning Message live on every request.
  const [rows, totalResult, summaryResult] = await Promise.all([
    prisma.message.groupBy({
      by: ['toAddress'],
      where,
      _count: { toAddress: true },
      _max: { receivedAt: true },
      // A single sort key with LIMIT/OFFSET is not stable: dozens of addresses
      // share a count of 1, so rows would repeat on one page and vanish from
      // the next. toAddress breaks every tie deterministically.
      orderBy:
        sort === 'count'
          ? [{ _count: { toAddress: 'desc' } }, { toAddress: 'asc' }]
          : [{ _max: { receivedAt: 'desc' } }, { toAddress: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT COUNT(DISTINCT "toAddress")::bigint AS count FROM "Message" ${totalWhereSql}`,
    ),
    // Type breakdown for the summary cards — respects q/domainId but not
    // `type` itself, since these three numbers *are* the type filter's menu.
    prisma.$queryRaw<{ mailbox_count: bigint; anonymous_count: bigint; catchall_count: bigint }[]>(
      Prisma.sql`
        SELECT
          COUNT(DISTINCT "toAddress") FILTER (WHERE ${mailboxInSql}) AS mailbox_count,
          COUNT(DISTINCT "toAddress")
            FILTER (WHERE ${mailboxNotInSql} AND "anonymousSessionId" IS NOT NULL) AS anonymous_count,
          COUNT(DISTINCT "toAddress")
            FILTER (WHERE ${mailboxNotInSql} AND "anonymousSessionId" IS NULL) AS catchall_count
        FROM "Message"
        ${baseWhereSql}
      `,
    ),
  ]);

  const total = Number(totalResult[0]?.count ?? 0);

  // Every customer address, with the owner beside it, is the same class of
  // access as the mail search — so it carries the same receipt. There is no
  // "no query" gate here on purpose: browsing the whole list is the point of
  // the screen, which is exactly why each visit is recorded.
  await writeAudit({
    actorId: admin.id,
    action: AUDIT.MAIL_ADDRESS_LIST,
    ipAddress: await requestIp(),
    metadata: { q, domainId, type, sort, page, resultCount: total },
  });
  const summary = summaryResult[0];
  const mailboxCount = Number(summary?.mailbox_count ?? 0);
  const anonymousCount = Number(summary?.anonymous_count ?? 0);
  const catchallCount = Number(summary?.catchall_count ?? 0);

  const pageAddresses = rows.map((r) => r.toAddress);

  // Second enrichment query — scoped to just this page's addresses, since
  // AnonymousSession isn't bounded the way Mailbox is.
  const anonRows =
    pageAddresses.length > 0
      ? await prisma.anonymousSession.findMany({
          where: { tempAddress: { in: pageAddresses } },
          select: { tempAddress: true, gateStatus: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];
  const anonByAddress = new Map<string, (typeof anonRows)[number]>();
  for (const a of anonRows) {
    if (!anonByAddress.has(a.tempAddress)) anonByAddress.set(a.tempAddress, a);
  }

  // Unread counts per address — groupBy has no conditional aggregate, so this
  // is one more fixed, page-scoped query rather than a per-row lookup.
  const unreadRows =
    pageAddresses.length > 0
      ? await prisma.message.groupBy({
          by: ['toAddress'],
          where: { toAddress: { in: pageAddresses }, isRead: false },
          _count: { toAddress: true },
        })
      : [];
  const unreadByAddress = new Map(unreadRows.map((u) => [u.toAddress, u._count.toAddress]));

  const items = rows.map((r) => {
    const address = r.toAddress;
    const mb = mailboxByAddress.get(address);
    const anon = anonByAddress.get(address);
    const addrType: Exclude<AddressType, 'all'> = mb ? 'mailbox' : anon ? 'anonymous' : 'catchall';
    return {
      address,
      domainName: address.split('@')[1] ?? '—',
      type: addrType,
      owner: mb?.user?.email ?? null,
      gateStatus: anon?.gateStatus ?? null,
      count: r._count.toAddress,
      unread: unreadByAddress.get(address) ?? 0,
      lastActivity: r._max.receivedAt,
    };
  });

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (next: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const merged = { q, domainId, type: sp.type ?? '', sort: sp.sort ?? '', page, ...next };
    if (merged.q) p.set('q', String(merged.q));
    if (merged.domainId) p.set('domainId', String(merged.domainId));
    if (merged.type) p.set('type', String(merged.type));
    if (merged.sort) p.set('sort', String(merged.sort));
    if (merged.page && Number(merged.page) > 1) p.set('page', String(merged.page));
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Addresses</h1>
        <p className="mt-1 text-sm text-gray-500">
          Every address that has actually received mail — provisioned mailboxes, catch-all traffic,
          and anonymous temp addresses alike.
        </p>
      </div>

      {/* summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total addresses" value={total} />
        <SummaryCard label="Mailboxes" value={mailboxCount} />
        <SummaryCard label="Catch-all" value={catchallCount} />
        <SummaryCard label="Anonymous" value={anonymousCount} />
      </div>

      {/* filters */}
      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3"
        action="/admin/addresses"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Address</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="part of an address…"
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
          <label className="text-xs text-gray-500">Type</label>
          <select
            name="type"
            defaultValue={type}
            className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          >
            <option value="all">All types</option>
            <option value="mailbox">Mailbox</option>
            <option value="catchall">Catch-all</option>
            <option value="anonymous">Anonymous</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Sort</label>
          <select
            name="sort"
            defaultValue={sort}
            className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          >
            <option value="recent">Last activity</option>
            <option value="count">Message count</option>
          </select>
        </div>
        <button className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
          Filter
        </button>
      </form>

      {/* rows — cards, not a table, so nothing needs horizontal scroll on mobile */}
      <div className="rounded-xl border bg-white">
        {items.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">No addresses match.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((it) => (
              <li key={it.address} className="p-4">
                <Link
                  href={`/admin/mail?addr=${encodeURIComponent(it.address)}`}
                  className="flex flex-col gap-1.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-all font-mono text-sm font-medium text-gray-900">
                      {it.address}
                    </span>
                    <TypeBadge type={it.type} />
                    {it.unread > 0 && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                        {it.unread} unread
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    <span>{it.domainName}</span>
                    <span>·</span>
                    <span>
                      {it.count} message{it.count === 1 ? '' : 's'}
                    </span>
                    <span>·</span>
                    <span>{it.lastActivity ? timeAgo(it.lastActivity) : '—'}</span>
                    {it.owner && (
                      <>
                        <span>·</span>
                        <span className="truncate">{it.owner}</span>
                      </>
                    )}
                    {it.gateStatus && (
                      <>
                        <span>·</span>
                        <span>{it.gateStatus.toLowerCase()}</span>
                      </>
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
          Page {page} of {pages} · {total} address{total === 1 ? '' : 'es'} total
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`/admin/addresses${qs({ page: page - 1 })}`}
              className="rounded border px-3 py-1 hover:bg-gray-50"
            >
              ← Prev
            </Link>
          )}
          {page < pages && (
            <Link
              href={`/admin/addresses${qs({ page: page + 1 })}`}
              className="rounded border px-3 py-1 hover:bg-gray-50"
            >
              Next →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function TypeBadge({ type }: { type: Exclude<AddressType, 'all'> }) {
  // Static class strings only — Tailwind can't see a `bg-${x}-100` built at
  // runtime, so each variant is spelled out in full.
  if (type === 'mailbox') {
    return (
      <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-600">
        mailbox
      </span>
    );
  }
  if (type === 'anonymous') {
    return (
      <span className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-600">
        anonymous
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-600">
      catch-all
    </span>
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
