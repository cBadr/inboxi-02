import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { plannedRecordsFor, getDeliverability } from '@/lib/domain-health';
import { CopyButton } from '@/components/CopyButton';
import { DomainActions } from '@/components/DomainActions';
import {
  setDomainAvailability,
  deleteDomain,
  assignDomain,
  unassignDomain,
} from '../../actions';

export const dynamic = 'force-dynamic';

const DNS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  VERIFYING: 'bg-blue-100 text-blue-700',
  VERIFIED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

interface ReportItem {
  type: string;
  name: string;
  expected: string;
  found: string[];
  ok: boolean;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

export default async function DomainDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const domain = await prisma.domain.findUnique({
    where: { id },
    include: {
      _count: { select: { mailboxes: true } },
      assignments: { include: { user: true, group: true } },
      trustScores: { orderBy: { computedAt: 'desc' }, take: 1 },
      reputationChecks: { orderBy: { checkedAt: 'desc' }, take: 6 },
    },
  });
  if (!domain) notFound();

  const records = plannedRecordsFor(domain);
  const report = (domain.dnsReport as { items?: ReportItem[]; passed?: number; total?: number } | null) ?? null;
  const trust = domain.trustScores[0];
  // Real (non catch-all) mailboxes — a domain is deletable only when it has none.
  const realMailboxes = await prisma.mailbox.count({
    where: { domainId: domain.id, type: { not: 'CATCH_ALL' } },
  });
  const deliverability = await getDeliverability(domain);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/domains" className="text-sm text-gray-500 hover:text-brand">
          ← Domains
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold">{domain.name}</h1>
          <span className={`rounded px-2 py-0.5 text-xs ${DNS_BADGE[domain.dnsStatus] ?? ''}`}>
            DNS: {domain.dnsStatus}
          </span>
          {trust && (
            <span className={`text-sm font-semibold ${scoreColor(trust.score)}`}>
              Trust {Math.round(trust.score)}/100
            </span>
          )}
          <span className={domain.isActive ? 'text-xs text-green-600' : 'text-xs text-gray-400'}>
            {domain.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        {domain.dnsLastCheckedAt && (
          <p className="mt-1 text-xs text-gray-400">
            Last checked {domain.dnsLastCheckedAt.toLocaleString()}
          </p>
        )}
      </div>

      {/* Interactive action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <DomainActions id={domain.id} isActive={domain.isActive} />
        {realMailboxes === 0 && (
          <form action={deleteDomain}>
            <input type="hidden" name="id" value={domain.id} />
            <button className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
              Delete
            </button>
          </form>
        )}
      </div>

      {/* Deliverability panel */}
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Deliverability</h2>
          <span className={`text-2xl font-bold ${scoreColor(deliverability.score)}`}>
            {deliverability.score}
            <span className="text-sm font-normal text-gray-400">/100</span>
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {deliverability.checks.map((c) => (
            <div key={c.label} className="flex items-center gap-2 text-sm">
              <span className={c.ok ? 'text-green-600' : 'text-red-500'}>{c.ok ? '✓' : '✗'}</span>
              <span className="text-gray-700">{c.label}</span>
              {c.detail && <span className="truncate text-xs text-gray-400">({c.detail})</span>}
            </div>
          ))}
        </div>
        {deliverability.recommendations.length > 0 && (
          <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-gray-600">
            {deliverability.recommendations.map((r, i) => (
              <li key={i}>💡 {r}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Settings + meta */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Settings</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Availability">
              <form action={setDomainAvailability} className="flex items-center gap-2">
                <input type="hidden" name="id" value={domain.id} />
                <select name="availability" defaultValue={domain.availability} className="rounded border px-2 py-1 text-xs">
                  <option value="FREE">Free</option>
                  <option value="ASSIGNED_USER">Assigned (user)</option>
                  <option value="ASSIGNED_GROUP">Assigned (group)</option>
                  <option value="DISABLED">Disabled</option>
                </select>
                <button className="text-xs text-brand hover:underline">Save</button>
              </form>
            </Row>
            <Row label="DNS provider">{domain.dnsProvider}</Row>
            <Row label="Cloudflare zone">{domain.cloudflareZoneId ?? '—'}</Row>
            <Row label="DKIM selector">{domain.dkimSelector}</Row>
            <Row label="Mailboxes">{domain._count.mailboxes}</Row>
            <Row label="Created">{domain.createdAt.toLocaleDateString()}</Row>
          </dl>
        </div>

        {/* Trust / reputation */}
        <div className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Reputation & Trust Score</h2>
          {trust ? (
            <>
              <div className={`text-3xl font-bold ${scoreColor(trust.score)}`}>
                {Math.round(trust.score)}
                <span className="text-base font-normal text-gray-400">/100</span>
              </div>
              {trust.factors && Object.keys(trust.factors as object).length > 0 && (
                <ul className="mt-2 text-xs text-gray-600">
                  {Object.entries(trust.factors as Record<string, number>).map(([k, v]) => (
                    <li key={k}>
                      {k}: <span className="text-red-600">{v}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 text-xs text-gray-500">
                <div className="mb-1 font-medium">Recent blacklist checks:</div>
                <ul className="space-y-0.5">
                  {domain.reputationChecks.map((c) => (
                    <li key={c.id}>
                      {c.source}:{' '}
                      <span className={c.listed ? 'text-red-600' : 'text-green-600'}>
                        {c.listed ? 'LISTED' : 'clean'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">No scan yet. Click “Run reputation scan”.</p>
          )}
        </div>
      </div>

      {/* DNS verification report */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">DNS verification</h2>
        {report?.items ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="py-1">Record</th>
                <th className="py-1">Name</th>
                <th className="py-1">Found</th>
                <th className="py-1">OK</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.items.map((it) => (
                <tr key={it.type}>
                  <td className="py-1 font-medium">{it.type}</td>
                  <td className="py-1 font-mono text-xs">{it.name}</td>
                  <td className="py-1 text-xs text-gray-500">
                    {it.found.length ? it.found.join(', ').slice(0, 50) : '—'}
                  </td>
                  <td className="py-1">{it.ok ? '✅' : '❌'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-400">No verification yet. Click “Re-check DNS”.</p>
        )}
      </div>

      {/* Required DNS records */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Required DNS records</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-400">
            <tr>
              <th className="py-1">Type</th>
              <th className="py-1">Name</th>
              <th className="py-1">Value</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {records.map((r, i) => (
              <tr key={i}>
                <td className="py-1 font-medium">
                  {r.type}
                  {r.priority ? ` (${r.priority})` : ''}
                </td>
                <td className="py-1 font-mono text-xs">{r.name}</td>
                <td className="py-1 max-w-md truncate font-mono text-xs">{r.content}</td>
                <td className="py-1">
                  <CopyButton value={r.content} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Assignments */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Assignments</h2>
        <form action={assignDomain} className="mb-3 flex items-center gap-2">
          <input type="hidden" name="domainId" value={domain.id} />
          <input name="email" type="email" placeholder="user@email.com" className="w-64 rounded border px-2 py-1 text-sm" />
          <button className="rounded bg-brand px-2 py-1 text-xs text-white hover:bg-brand-dark">Assign to user</button>
        </form>
        <ul className="divide-y text-sm">
          {domain.assignments.length === 0 && <li className="py-2 text-gray-400">No assignments</li>}
          {domain.assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2">
              <span>{a.user?.email ?? a.group?.name ?? '—'}</span>
              <form action={unassignDomain}>
                <input type="hidden" name="assignmentId" value={a.id} />
                <input type="hidden" name="domainId" value={domain.id} />
                <button className="text-xs text-red-500 hover:underline">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

