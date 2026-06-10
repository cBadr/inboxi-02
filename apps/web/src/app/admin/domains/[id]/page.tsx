import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { plannedRecordsFor, getDeliverability } from '@/lib/domain-health';
import { CopyButton } from '@/components/CopyButton';
import { DomainActions } from '@/components/DomainActions';
import { FixDnsButton } from '@/components/FixDnsButton';
import { ModuleActionForm } from '@/components/ModuleActionForm';
import {
  setDomainAvailability,
  deleteDomain,
  assignDomain,
  unassignDomain,
} from '../../actions';
import {
  setDmarcPolicy,
  generateVerification,
  verifyOwnership,
  listDnsRecords,
  addDnsRecord,
  deleteDnsRecord,
  sendDomainTest,
} from '../../domain-actions';

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

function ringStroke(score: number): string {
  if (score >= 80) return '#16a34a';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

function ScoreRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={ringStroke(score)}
        strokeWidth="6"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="37" textAnchor="middle" className="fill-gray-800 text-base font-bold">
        {score}
      </text>
    </svg>
  );
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

  // Sending stats for the domain (outbound from any address on it).
  const fromFilter = { fromAddress: { endsWith: `@${domain.name}` } };
  const [sentCount, failedCount, blockedCount, cfRecords, auditLog, lastSends] = await Promise.all([
    prisma.outboundMessage.count({ where: { ...fromFilter, status: 'SENT' } }),
    prisma.outboundMessage.count({ where: { ...fromFilter, status: { in: ['FAILED', 'BOUNCED', 'COMPLAINED'] } } }),
    prisma.outboundMessage.count({ where: { ...fromFilter, status: 'BLOCKED' } }),
    listDnsRecords(domain.id),
    prisma.auditLog.findMany({ where: { entityId: domain.id }, orderBy: { createdAt: 'desc' }, take: 8 }),
    prisma.outboundMessage.findMany({ where: fromFilter, orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);

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

      {/* Deliverability panel (prominent) */}
      <div className="rounded-lg border-2 border-brand/20 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Deliverability</h2>
            <p className="text-xs text-gray-500">
              {deliverability.checks.filter((c) => c.ok).length}/{deliverability.checks.length}{' '}
              checks passing — higher = better inbox placement.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ScoreRing score={deliverability.score} />
            {deliverability.dnsFixable && (
              <FixDnsButton id={domain.id} />
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {deliverability.checks.map((c) => (
            <div key={c.key} className="flex items-start gap-2 rounded border p-2 text-sm">
              <span className={c.ok ? 'mt-0.5 text-green-600' : 'mt-0.5 text-red-500'}>
                {c.ok ? '✓' : '✗'}
              </span>
              <div className="min-w-0">
                <div className="font-medium text-gray-700">{c.label}</div>
                {c.value && (
                  <div className="truncate font-mono text-xs text-gray-400" title={c.value}>
                    {c.value}
                  </div>
                )}
                {!c.ok && c.hint && <div className="mt-0.5 text-xs text-amber-600">→ {c.hint}</div>}
              </div>
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
        <div className="mt-3 flex flex-wrap gap-3 border-t pt-3 text-xs">
          <a href="https://www.mail-tester.com" target="_blank" rel="noreferrer" className="text-brand hover:underline">
            Test score on mail-tester.com ↗
          </a>
          <a href="https://check.spamhaus.org" target="_blank" rel="noreferrer" className="text-brand hover:underline">
            Check Spamhaus ↗
          </a>
          <a
            href={`https://mxtoolbox.com/SuperTool.aspx?action=mx%3a${domain.name}`}
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            MXToolbox diagnostics ↗
          </a>
        </div>
      </div>

      {/* Reputation & Trust (prominent) */}
      <div className="rounded-lg border-2 border-amber-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold">Reputation &amp; Trust Score</h2>
        {trust ? (
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3">
              <ScoreRing score={Math.round(trust.score)} />
              <div className="text-xs text-gray-500">
                Sender trust for IP {process.env.SERVER_IP}
                <br />
                scanned {new Date(trust.computedAt).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-gray-400">Score factors</div>
              {trust.factors && Object.keys(trust.factors as object).length > 0 ? (
                <ul className="space-y-0.5 text-xs">
                  {Object.entries(trust.factors as Record<string, number>).map(([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span className="text-gray-600">{k}</span>
                      <span className="font-mono text-red-600">{v}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-green-600">No penalties — clean.</p>
              )}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-gray-400">
                Blacklist checks
              </div>
              <ul className="space-y-0.5 text-xs">
                {domain.reputationChecks.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span className="truncate font-mono text-gray-600">
                      {c.source.replace('dnsbl:', '')}
                    </span>
                    <span className={c.listed ? 'font-semibold text-red-600' : 'text-green-600'}>
                      {c.listed ? 'LISTED' : 'clean'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-400">
            No scan yet. Click “Reputation scan” in the action bar.
          </p>
        )}
      </div>

      {/* Settings */}
      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Settings</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
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
          <Row label="DMARC policy">
            <form action={setDmarcPolicy} className="flex items-center gap-2">
              <input type="hidden" name="id" value={domain.id} />
              <select name="dmarcPolicy" defaultValue={domain.dmarcPolicy} className="rounded border px-2 py-1 text-xs">
                <option value="none">none (monitor)</option>
                <option value="quarantine">quarantine</option>
                <option value="reject">reject (strict)</option>
              </select>
              <button className="text-xs text-brand hover:underline">Apply</button>
            </form>
          </Row>
          <Row label="DNS provider">{domain.dnsProvider}</Row>
          <Row label="Cloudflare zone">{domain.cloudflareZoneId ?? '—'}</Row>
          <Row label="DKIM selector">{domain.dkimSelector}</Row>
          <Row label="DKIM key age">
            {domain.dkimGeneratedAt ? (
              <DkimAge generatedAt={domain.dkimGeneratedAt} />
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </Row>
          <Row label="Ownership">
            {domain.verifiedAt ? (
              <span className="text-green-600">verified ✓</span>
            ) : (
              <span className="text-gray-400">unverified</span>
            )}
          </Row>
          <Row label="Mailboxes">{domain._count.mailboxes}</Row>
        </dl>
      </div>

      {/* Sending stats + test */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Sending activity</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Sent" value={sentCount} color="text-green-600" />
            <Stat label="Failed/bounced" value={failedCount} color="text-red-500" />
            <Stat label="Blocked" value={blockedCount} color="text-amber-600" />
          </div>
          {lastSends.length > 0 && (
            <ul className="mt-3 space-y-1 border-t pt-2 text-xs text-gray-500">
              {lastSends.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span className="truncate">{s.toAddress}</span>
                  <span className={s.status === 'SENT' ? 'text-green-600' : 'text-red-500'}>{s.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Send a test message</h2>
          <ModuleActionForm action={sendDomainTest} submitLabel="Send test" successText="Sent ✓">
            <input type="hidden" name="domainId" value={domain.id} />
            <div className="flex items-center gap-1 text-sm">
              <input name="localPart" defaultValue="postmaster" className="w-32 rounded border px-2 py-1" />
              <span className="text-gray-400">@{domain.name}</span>
            </div>
            <input name="to" type="email" placeholder="recipient@example.com" className="w-full rounded border px-2 py-1 text-sm" />
          </ModuleActionForm>
        </div>
      </div>

      {/* Ownership verification (for custom domains) */}
      {!domain.verifiedAt && (
        <div className="rounded-lg border bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold">Verify domain ownership</h2>
          {domain.verificationToken ? (
            <div className="text-sm">
              <p className="text-gray-600">Add this TXT record, then click Verify:</p>
              <div className="mt-2 flex items-center gap-2 rounded bg-gray-50 p-2 font-mono text-xs">
                <span>TXT</span>
                <span>_inboxi-verify.{domain.name}</span>
                <span className="truncate">{domain.verificationToken}</span>
                <CopyButton value={domain.verificationToken} />
              </div>
              <form action={verifyOwnership} className="mt-2">
                <input type="hidden" name="id" value={domain.id} />
                <button className="rounded bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark">
                  Verify now
                </button>
              </form>
            </div>
          ) : (
            <form action={generateVerification}>
              <input type="hidden" name="id" value={domain.id} />
              <button className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">
                Generate verification token
              </button>
            </form>
          )}
        </div>
      )}

      {/* Custom DNS records (Cloudflare) */}
      <details className="rounded-lg border bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-700">
          Custom DNS records{' '}
          <span className="font-normal text-gray-400">
            ({cfRecords.length} via Cloudflare{domain.cloudflareZoneId ? '' : ' — no zone yet'})
          </span>
        </summary>
        <div className="mt-3">
          <ModuleActionForm
            action={addDnsRecord}
            submitLabel="Add record"
            className="mb-3 flex flex-wrap items-end gap-2 rounded border bg-gray-50 p-3"
          >
            <input type="hidden" name="domainId" value={domain.id} />
            <select name="type" className="rounded border px-2 py-1 text-sm">
              {['A', 'AAAA', 'CNAME', 'TXT', 'MX'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input name="name" placeholder="name (@ for root)" className="w-32 rounded border px-2 py-1 text-sm" />
            <input name="content" placeholder="value" className="w-48 rounded border px-2 py-1 text-sm" />
            <input name="priority" type="number" placeholder="prio" className="w-16 rounded border px-2 py-1 text-sm" />
          </ModuleActionForm>
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {cfRecords.length === 0 && (
                <tr>
                  <td className="py-2 text-gray-400">
                    {domain.cloudflareZoneId ? 'No records.' : 'Provision DNS first to create a Cloudflare zone.'}
                  </td>
                </tr>
              )}
              {cfRecords.map((r) => (
                <tr key={r.id}>
                  <td className="py-1 font-medium">{r.type}</td>
                  <td className="py-1 font-mono text-xs">{r.name}</td>
                  <td className="py-1 max-w-xs truncate font-mono text-xs">{r.content}</td>
                  <td className="py-1 text-right">
                    <form action={deleteDnsRecord}>
                      <input type="hidden" name="domainId" value={domain.id} />
                      <input type="hidden" name="recordId" value={r.id} />
                      <button className="text-xs text-red-500 hover:underline">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* Audit timeline */}
      {auditLog.length > 0 && (
        <details className="rounded-lg border bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700">
            Activity log <span className="font-normal text-gray-400">({auditLog.length})</span>
          </summary>
          <ul className="mt-3 space-y-1 text-xs">
            {auditLog.map((a) => (
              <li key={a.id} className="flex justify-between gap-2">
                <span className="font-mono text-gray-600">{a.action}</span>
                <span className="text-gray-400">{a.createdAt.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* DNS verification report (collapsible — needed mainly during setup / troubleshooting) */}
      <details className="rounded-lg border bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-700">
          DNS verification report{' '}
          <span className="font-normal text-gray-400">
            ({report?.passed ?? 0}/{report?.total ?? 4} records OK)
          </span>
        </summary>
        <div className="mt-3">
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
      </details>

      {/* Required DNS records (collapsible) */}
      <details className="rounded-lg border bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-700">
          Required DNS records{' '}
          <span className="font-normal text-gray-400">(for manual setup / reference)</span>
        </summary>
        <table className="mt-3 w-full text-sm">
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
      </details>

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

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded border p-2">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}

function DkimAge({ generatedAt }: { generatedAt: Date }) {
  const days = Math.floor((Date.now() - new Date(generatedAt).getTime()) / 86_400_000);
  const stale = days > 180;
  return (
    <span className={stale ? 'text-amber-600' : 'text-gray-600'}>
      {days}d{stale ? ' · rotate recommended' : ''}
    </span>
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

