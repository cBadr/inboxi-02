import Link from 'next/link';
import { prisma, type Prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { NewDomainForm } from '@/components/NewDomainForm';
import { DangerButton } from '@/components/admin/DangerButton';
import { bulkProvisionAll, bulkRecheckAll } from '../domain-actions';
import {
  rescanDomain,
  autoFixDns,
  toggleDomainActive,
  setDomainAvailability,
  assignDomain,
  assignDomainToGroup,
  unassignDomain,
  deleteDomain,
} from '../actions';

export const dynamic = 'force-dynamic';

const DNS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  VERIFYING: 'bg-blue-100 text-blue-700',
  VERIFIED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

const AVAILABILITY: Array<{ value: string; label: string }> = [
  { value: 'FREE', label: 'Free' },
  { value: 'ASSIGNED_USER', label: 'Assigned (user)' },
  { value: 'ASSIGNED_GROUP', label: 'Assigned (group)' },
  { value: 'DISABLED', label: 'Disabled' },
];

const SORTS: Record<string, Prisma.DomainOrderByWithRelationInput> = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  name: { name: 'asc' },
  deliverability: { deliverabilityScore: { sort: 'desc', nulls: 'last' } },
  inbox: { inboxScore: { sort: 'desc', nulls: 'last' } },
};

function barColor(s: number): string {
  return s >= 80 ? 'bg-green-500' : s >= 50 ? 'bg-amber-500' : 'bg-red-500';
}
function textColor(s: number): string {
  return s >= 80 ? 'text-green-600' : s >= 50 ? 'text-amber-600' : 'text-red-600';
}

export default async function AdminDomainsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dns?: string; avail?: string; active?: string; sort?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const dns = sp.dns ?? '';
  const avail = sp.avail ?? '';
  const active = sp.active ?? '';
  const sort = SORTS[sp.sort ?? 'newest'] ? (sp.sort ?? 'newest') : 'newest';

  const where: Prisma.DomainWhereInput = {
    ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    ...(dns ? { dnsStatus: dns as Prisma.DomainWhereInput['dnsStatus'] } : {}),
    ...(avail ? { availability: avail as Prisma.DomainWhereInput['availability'] } : {}),
    ...(active === 'active' ? { isActive: true } : {}),
    ...(active === 'inactive' ? { isActive: false } : {}),
  };

  const [domains, groups, agg, totalAll, activeAll, attention] = await Promise.all([
    prisma.domain.findMany({
      where,
      orderBy: SORTS[sort],
      include: {
        _count: { select: { mailboxes: true } },
        trustScores: { orderBy: { computedAt: 'desc' }, take: 1 },
        assignments: {
          include: {
            user: { select: { email: true } },
            group: { select: { name: true, _count: { select: { members: true } } } },
          },
        },
      },
    }),
    prisma.group.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { members: true } } } }),
    prisma.domain.aggregate({ _avg: { deliverabilityScore: true } }),
    prisma.domain.count(),
    prisma.domain.count({ where: { isActive: true } }),
    prisma.domain.count({ where: { dnsStatus: { in: ['FAILED', 'PENDING'] } } }),
  ]);

  const avgDeliver = Math.round(agg._avg.deliverabilityScore ?? 0);
  const filtered = q || dns || avail || active;

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Domains &amp; DNS</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Automate Cloudflare DNS, verify records, assign access, and monitor deliverability.
          </p>
        </div>
        <div className="flex gap-2">
          <form action={bulkProvisionAll}>
            <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">Provision all</button>
          </form>
          <form action={bulkRecheckAll}>
            <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">Re-check all</button>
          </form>
        </div>
      </div>

      {/* summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Domains" value={totalAll} />
        <SummaryCard label="Active" value={activeAll} />
        <SummaryCard label="Avg deliverability" value={`${avgDeliver}%`} tone={avgDeliver >= 80 ? 'good' : avgDeliver >= 50 ? 'warn' : 'bad'} />
        <SummaryCard label="Needs attention" value={attention} tone={attention > 0 ? 'warn' : 'good'} />
      </div>

      {/* add domain (collapsible) */}
      <details className="rounded-xl border bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700">
          + Add a new domain
        </summary>
        <div className="border-t px-4 py-4">
          <NewDomainForm />
        </div>
      </details>

      {/* toolbar: search + filters + sort */}
      <form action="/admin/domains" className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search domain…"
          className="w-48 rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        <select name="dns" defaultValue={dns} className="rounded-lg border px-2 py-1.5 text-sm">
          <option value="">DNS: any</option>
          {['VERIFIED', 'VERIFYING', 'PENDING', 'FAILED'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select name="avail" defaultValue={avail} className="rounded-lg border px-2 py-1.5 text-sm">
          <option value="">Availability: any</option>
          {AVAILABILITY.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
        <select name="active" defaultValue={active} className="rounded-lg border px-2 py-1.5 text-sm">
          <option value="">State: any</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select name="sort" defaultValue={sort} className="rounded-lg border px-2 py-1.5 text-sm">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name A–Z</option>
          <option value="deliverability">Best deliverability</option>
          <option value="inbox">Best inbox</option>
        </select>
        <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">Apply</button>
        {filtered && (
          <a href="/admin/domains" className="text-xs text-gray-400 hover:underline">clear</a>
        )}
        <span className="ml-auto text-sm text-gray-400">{domains.length} shown</span>
      </form>

      {/* rows */}
      <div className="space-y-2">
        {domains.length === 0 && (
          <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-gray-500">
            {filtered ? 'No domains match your filters.' : 'No domains yet — add one above.'}
          </div>
        )}
        {domains.map((d) => {
          const trust = d.trustScores[0];
          const ageDays = Math.floor((Date.now() - new Date(d.createdAt).getTime()) / 86_400_000);
          const userAssignments = d.assignments.filter((a) => a.user);
          const groupAssignments = d.assignments.filter((a) => a.group);
          const reach = groupAssignments.reduce((s, a) => s + (a.group?._count.members ?? 0), userAssignments.length);

          return (
            <div key={d.id} className="overflow-hidden rounded-xl border bg-white">
              {/* main row */}
              <div className="flex flex-wrap items-center gap-4 px-4 py-3">
                {/* identity */}
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/domains/${d.id}`} className="font-mono text-sm font-semibold text-gray-900 hover:text-brand">
                      {d.name}
                    </Link>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${DNS_BADGE[d.dnsStatus] ?? 'bg-gray-100'}`}>
                      {d.dnsStatus}
                    </span>
                    <span className={`text-[10px] ${d.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                      ● {d.isActive ? 'active' : 'inactive'}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
                    <span>{ageDays}d old</span>
                    <span>·</span>
                    <span>{AVAILABILITY.find((a) => a.value === d.availability)?.label ?? d.availability}</span>
                    <span>·</span>
                    <span>{reach} user(s)</span>
                  </div>
                </div>

                {/* metrics */}
                <div className="flex items-center gap-4">
                  <Meter label="Deliv." score={d.deliverabilityScore} />
                  <Meter label="Inbox" score={d.inboxScore} />
                  <MiniStat label="Trust" value={trust ? Math.round(trust.score) : null} />
                  <MiniStat label="Boxes" value={d._count.mailboxes} plain />
                </div>

                {/* actions */}
                <div className="flex items-center gap-1.5">
                  <form action={rescanDomain}>
                    <input type="hidden" name="id" value={d.id} />
                    <button title="Re-check deliverability" className="rounded-lg border px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                      ↻
                    </button>
                  </form>
                  <form action={autoFixDns}>
                    <input type="hidden" name="id" value={d.id} />
                    <button title="Fix DNS automatically" className="rounded-lg border px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                      ⚙ Fix
                    </button>
                  </form>
                  <Link href={`/admin/domains/${d.id}`} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark">
                    Manage
                  </Link>
                </div>
              </div>

              {/* expandable: settings + access */}
              <details className="border-t">
                <summary className="cursor-pointer bg-gray-50/50 px-4 py-2 text-xs text-gray-500 hover:bg-gray-50">
                  Settings &amp; access
                </summary>
                <div className="space-y-3 px-4 py-3">
                  {/* quick settings */}
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={setDomainAvailability} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={d.id} />
                      <select name="availability" defaultValue={d.availability} className="rounded border px-2 py-1 text-xs">
                        {AVAILABILITY.map((a) => (
                          <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                      </select>
                      <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50">Set availability</button>
                    </form>
                    <form action={toggleDomainActive}>
                      <input type="hidden" name="id" value={d.id} />
                      <button className={`rounded px-2 py-1 text-xs ${d.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {d.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </form>
                    <DangerButton
                      action={deleteDomain}
                      hidden={{ id: d.id }}
                      className="ml-auto flex items-center gap-2"
                      confirmText={`Delete ${d.name}? This also deletes its catch-all and every message received on it. This cannot be undone.`}
                    />
                  </div>

                  {/* access */}
                  <div>
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Users &amp; access</div>
                    {d.assignments.length > 0 && (
                      <ul className="mb-2 flex flex-wrap gap-1.5">
                        {d.assignments.map((a) => (
                          <li key={a.id} className="flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-xs">
                            <span className={a.group ? 'text-purple-700' : 'text-gray-700'}>
                              {a.group ? `👥 ${a.group.name} (${a.group._count.members})` : `👤 ${a.user?.email}`}
                            </span>
                            <form action={unassignDomain}>
                              <input type="hidden" name="assignmentId" value={a.id} />
                              <input type="hidden" name="domainId" value={d.id} />
                              <button className="text-gray-300 hover:text-red-500">✕</button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={assignDomain} className="flex items-center gap-1">
                        <input type="hidden" name="domainId" value={d.id} />
                        <input name="email" type="email" placeholder="user@email.com" className="w-48 rounded border px-2 py-1 text-xs" />
                        <button className="rounded bg-brand px-2 py-1 text-xs text-white hover:bg-brand-dark">Assign user</button>
                      </form>
                      {groups.length > 0 && (
                        <form action={assignDomainToGroup} className="flex items-center gap-1">
                          <input type="hidden" name="domainId" value={d.id} />
                          <select name="groupId" defaultValue="" className="rounded border px-2 py-1 text-xs">
                            <option value="" disabled>Select group…</option>
                            {groups.map((g) => (
                              <option key={g.id} value={g.id}>{g.name} ({g._count.members})</option>
                            ))}
                          </select>
                          <button className="rounded bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-700">Assign group</button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const c = tone === 'good' ? 'text-green-600' : tone === 'warn' ? 'text-amber-600' : tone === 'bad' ? 'text-red-600' : 'text-gray-900';
  return (
    <div className="rounded-xl border bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${c}`}>{value}</div>
    </div>
  );
}

function Meter({ label, score }: { label: string; score: number | null }) {
  const has = typeof score === 'number';
  return (
    <div className="w-16">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wide text-gray-400">{label}</span>
        <span className={`text-xs font-bold ${has ? textColor(score!) : 'text-gray-300'}`}>{has ? score : '—'}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${has ? barColor(score!) : 'bg-gray-200'}`} style={{ width: `${has ? score : 0}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, plain = false }: { label: string; value: number | null; plain?: boolean }) {
  const has = typeof value === 'number';
  return (
    <div className="text-center">
      <div className={`text-sm font-bold ${plain || !has ? 'text-gray-900' : textColor(value!)}`}>
        {has ? value : '—'}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}
