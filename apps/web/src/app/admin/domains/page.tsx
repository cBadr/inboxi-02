import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { NewDomainForm } from '@/components/NewDomainForm';
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

function barColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}
function textColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

export default async function AdminDomainsPage() {
  await requireAdmin();
  const [domains, groups] = await Promise.all([
    prisma.domain.findMany({
      orderBy: { createdAt: 'desc' },
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
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Domains &amp; DNS</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Add domains, automate Cloudflare DNS, verify records, assign access, and monitor
            deliverability &amp; inbox placement.
          </p>
        </div>
        <div className="flex gap-2">
          <form action={bulkProvisionAll}>
            <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">
              Provision all
            </button>
          </form>
          <form action={bulkRecheckAll}>
            <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">
              Re-check all
            </button>
          </form>
        </div>
      </div>

      {/* Add domain */}
      <div className="mt-5 rounded-xl border bg-white p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Add a new domain
        </div>
        <NewDomainForm />
      </div>

      {/* Domain cards */}
      <div className="mt-5 space-y-4">
        {domains.length === 0 && (
          <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-gray-500">
            No domains yet — add one above.
          </div>
        )}
        {domains.map((d) => {
          const trust = d.trustScores[0];
          const ageDays = Math.floor((Date.now() - new Date(d.createdAt).getTime()) / 86_400_000);
          const deliver = d.deliverabilityScore;
          const inbox = d.inboxScore;
          const userAssignments = d.assignments.filter((a) => a.user);
          const groupAssignments = d.assignments.filter((a) => a.group);
          const memberReach = groupAssignments.reduce(
            (s, a) => s + (a.group?._count.members ?? 0),
            userAssignments.length,
          );

          return (
            <div key={d.id} className="overflow-hidden rounded-xl border bg-white">
              {/* header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/domains/${d.id}`}
                    className="font-mono text-base font-semibold text-gray-900 hover:text-brand"
                  >
                    {d.name}
                  </Link>
                  <span
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500"
                    title={`Added ${new Date(d.createdAt).toLocaleDateString()}`}
                  >
                    {ageDays}d old
                  </span>
                  <span className={`rounded px-2 py-0.5 text-[11px] ${DNS_BADGE[d.dnsStatus] ?? ''}`}>
                    DNS {d.dnsStatus}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* availability */}
                  <form action={setDomainAvailability} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={d.id} />
                    <select
                      name="availability"
                      defaultValue={d.availability}
                      className="rounded border px-2 py-1 text-xs"
                    >
                      {AVAILABILITY.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50">Set</button>
                  </form>
                  {/* active toggle */}
                  <form action={toggleDomainActive}>
                    <input type="hidden" name="id" value={d.id} />
                    <button
                      className={`rounded px-2 py-1 text-xs ${d.isActive ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >
                      {d.isActive ? '● Active' : '○ Inactive'}
                    </button>
                  </form>
                </div>
              </div>

              {/* metrics */}
              <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
                <ScoreMeter label="Deliverability" score={deliver} suffix="%" />
                <ScoreMeter label="Inbox placement" score={inbox} suffix="%" />
                <div className="rounded-lg border p-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">Trust score</div>
                  <div className="mt-1 flex items-end gap-2">
                    <span className={`text-2xl font-bold ${trust ? textColor(trust.score) : 'text-gray-300'}`}>
                      {trust ? Math.round(trust.score) : '—'}
                    </span>
                    <span className="pb-1 text-xs text-gray-400">/ 100</span>
                  </div>
                </div>
                <div className="flex flex-col justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-400">
                      Mailboxes
                    </div>
                    <div className="mt-1 text-2xl font-bold text-gray-900">
                      {d._count.mailboxes}
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">
                    {d.deliverabilityCheckedAt
                      ? `checked ${timeAgo(d.deliverabilityCheckedAt)}`
                      : 'never checked'}
                  </div>
                </div>
              </div>

              {/* users / assignments */}
              <div className="border-t bg-gray-50/40 px-5 py-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Users &amp; access
                  </span>
                  <span className="text-[11px] text-gray-400">~{memberReach} user(s) reached</span>
                </div>

                {d.assignments.length === 0 ? (
                  <p className="mb-3 text-sm text-gray-400">
                    No users assigned — domain is {d.availability === 'FREE' ? 'open to everyone (Free)' : 'unassigned'}.
                  </p>
                ) : (
                  <ul className="mb-3 flex flex-wrap gap-2">
                    {d.assignments.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs"
                      >
                        {a.group ? (
                          <span className="inline-flex items-center gap-1 text-purple-700">
                            <GroupIcon /> {a.group.name}
                            <span className="text-gray-400">({a.group._count.members})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-700">
                            <UserIcon /> {a.user?.email}
                          </span>
                        )}
                        <form action={unassignDomain}>
                          <input type="hidden" name="assignmentId" value={a.id} />
                          <input type="hidden" name="domainId" value={d.id} />
                          <button className="text-gray-300 hover:text-red-500" title="Remove">
                            ✕
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}

                {/* assign controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <form action={assignDomain} className="flex items-center gap-1">
                    <input type="hidden" name="domainId" value={d.id} />
                    <input
                      name="email"
                      type="email"
                      placeholder="user@email.com"
                      className="w-52 rounded border px-2 py-1 text-xs"
                    />
                    <button className="rounded bg-brand px-2.5 py-1 text-xs text-white hover:bg-brand-dark">
                      Assign user
                    </button>
                  </form>

                  {groups.length > 0 && (
                    <form action={assignDomainToGroup} className="flex items-center gap-1">
                      <input type="hidden" name="domainId" value={d.id} />
                      <select name="groupId" className="rounded border px-2 py-1 text-xs" defaultValue="">
                        <option value="" disabled>
                          Select group…
                        </option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name} ({g._count.members})
                          </option>
                        ))}
                      </select>
                      <button className="rounded bg-purple-600 px-2.5 py-1 text-xs text-white hover:bg-purple-700">
                        Assign group
                      </button>
                    </form>
                  )}
                </div>
              </div>

              {/* actions footer */}
              <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
                <form action={rescanDomain}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <RefreshIcon /> Re-check deliverability
                  </button>
                </form>
                <form action={autoFixDns}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <WrenchIcon /> Fix DNS
                  </button>
                </form>
                <Link
                  href={`/admin/domains/${d.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
                >
                  Manage →
                </Link>
                <form action={deleteDomain} className="ml-auto">
                  <input type="hidden" name="id" value={d.id} />
                  <button className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreMeter({
  label,
  score,
  suffix = '',
}: {
  label: string;
  score: number | null;
  suffix?: string;
}) {
  const has = typeof score === 'number';
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 flex items-end gap-1">
        <span className={`text-2xl font-bold ${has ? textColor(score!) : 'text-gray-300'}`}>
          {has ? score : '—'}
        </span>
        {has && <span className="pb-1 text-xs text-gray-400">{suffix}</span>}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full ${has ? barColor(score!) : 'bg-gray-200'}`}
          style={{ width: `${has ? score : 0}%` }}
        />
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
  return `${days}d ago`;
}

/* — icons — */
function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
function WrenchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.3L3 18l3 3 6.4-6.3a4 4 0 0 0 5.3-5.4l-2.8 2.8-2.1-2.1 2.8-2.8Z" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function GroupIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
