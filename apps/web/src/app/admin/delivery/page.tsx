import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { ModuleActionForm } from '@/components/ModuleActionForm';
import { getOutboundStats, getTransportStats } from '@/lib/sending-stats';
import { readOutboundSpool } from '@/lib/mail-spool';
import {
  createTransport,
  toggleTransport,
  setDefaultTransport,
  deleteTransport,
  assignDomainTransport,
  sendTestEmail,
} from '../delivery-actions';

export const dynamic = 'force-dynamic';

export default async function AdminDeliveryPage() {
  await requireAdmin();
  const [transports, domains, stats, transportStats, spool] = await Promise.all([
    prisma.deliveryTransport.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
    prisma.domain.findMany({
      orderBy: { name: 'asc' },
      include: { deliveryConfig: { include: { transport: true } } },
    }),
    getOutboundStats(),
    getTransportStats(),
    readOutboundSpool(), // one disk read for the whole page — never call this in a loop
  ]);

  const failPct = Math.round(stats.failureRate * 100);
  const deliveredPct = Math.round(stats.deliveredRate * 100);
  const queueWarning = spool.available && (spool.depth > 1000 || (spool.oldestMinutes ?? 0) > 60);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Sending / Delivery</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure how outbound mail is delivered: self-host (Haraka on 25/587/465) or an external
          SMTP relay. Pick a global default and override per domain.
        </p>
      </div>

      {/* Outbound queue — the number that actually caught the SENT-lie incident */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Outbound queue</h2>
        <div
          className={`rounded-xl border p-5 ${
            !spool.available
              ? 'bg-gray-50'
              : queueWarning
                ? 'border-red-300 bg-red-50'
                : 'bg-white'
          }`}
        >
          {!spool.available ? (
            <p className="text-sm text-gray-500">
              Queue depth not available on this machine — the outbound MTA is not colocated
              (expected in local dev).
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-400">Depth</div>
                <div
                  className={`mt-1 text-2xl font-bold ${queueWarning ? 'text-red-600' : 'text-gray-900'}`}
                >
                  {spool.depth.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-400">Oldest message</div>
                <div
                  className={`mt-1 text-2xl font-bold ${queueWarning ? 'text-red-600' : 'text-gray-900'}`}
                >
                  {spool.oldestMinutes === null ? '—' : `${spool.oldestMinutes}m`}
                </div>
              </div>
              {queueWarning && (
                <div className="col-span-2 flex items-center text-sm font-medium text-red-700 sm:col-span-1">
                  ⚠ Backlog building up — check the MTA and transports below.
                </div>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-gray-400">
            Rows written SENT before this fix predate it and will not be corrected retroactively —
            this queue depth, not historical SENT counts, is the live truth.
          </p>
        </div>
      </section>

      {/* Delivery health */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Delivery health</h2>
          <Link href="/admin/outbox" className="text-xs text-brand hover:underline">
            View Outbox →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-gray-400">Sent (total)</div>
            <div className="mt-1 text-2xl font-bold text-green-600">{stats.byStatus.SENT ?? 0}</div>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-gray-400">Queued (total)</div>
            <div className="mt-1 text-2xl font-bold text-amber-600">{stats.queued}</div>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-gray-400">Failed</div>
            <div className="mt-1 text-2xl font-bold text-red-600">{stats.byStatus.FAILED ?? 0}</div>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-gray-400">24h delivered</div>
            <div className={`mt-1 text-2xl font-bold ${deliveredPct >= 95 ? 'text-green-600' : deliveredPct >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
              {deliveredPct}%
            </div>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-gray-400">24h failure</div>
            <div className={`mt-1 text-2xl font-bold ${failPct >= 20 ? 'text-red-600' : failPct >= 5 ? 'text-amber-600' : 'text-green-600'}`}>
              {failPct}%
            </div>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-gray-400">24h queued</div>
            <div className="mt-1 text-2xl font-bold text-amber-600">{stats.last24hQueued}</div>
          </div>
        </div>
        {transportStats.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-400">
                <tr>
                  <th className="p-3">Transport</th>
                  <th className="p-3">Sent</th>
                  <th className="p-3">Queued</th>
                  <th className="p-3">Failed</th>
                  <th className="p-3">Success rate</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transportStats.map((t) => {
                  const pct = Math.round(t.successRate * 100);
                  return (
                    <tr key={t.transportType}>
                      <td className="p-3 font-medium">{t.transportType}</td>
                      <td className="p-3">{t.sent}</td>
                      <td className="p-3 text-amber-600">{t.queued}</td>
                      <td className="p-3">{t.failed}</td>
                      <td className="p-3">
                        <span className={pct >= 95 ? 'text-green-600' : pct >= 80 ? 'text-amber-600' : 'text-red-600'}>
                          {pct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* New transport */}
      <section className="max-w-2xl">
        <h2 className="mb-2 text-sm font-semibold">Add a transport</h2>
        <ModuleActionForm action={createTransport} submitLabel="Create transport">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-gray-600">Name</span>
              <input name="name" placeholder="e.g. Brevo relay" className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Type</span>
              <select name="type" className="mt-1 w-full rounded border px-3 py-2">
                <option value="SMTP_RELAY">External SMTP relay</option>
                <option value="SELF_HOST">Self-host (local Haraka)</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">SMTP host</span>
              <input name="smtpHost" placeholder="smtp.provider.com or 127.0.0.1" className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Port</span>
              <input name="smtpPort" type="number" placeholder="587 / 465 / 25" className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Username (optional)</span>
              <input name="smtpUsername" className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Password (optional, stored encrypted)</span>
              <input name="smtpPassword" type="password" className="mt-1 w-full rounded border px-3 py-2" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="smtpSecure" /> Use TLS (port 465 / implicit TLS)
          </label>
        </ModuleActionForm>
      </section>

      {/* Transport list */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Transports</h2>
        <div className="space-y-3">
          {transports.length === 0 && (
            <p className="text-sm text-gray-500">No transports yet — add one above.</p>
          )}
          {transports.map((t) => (
            <div key={t.id} className="rounded-lg border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{t.name}</span>{' '}
                  <span className="text-xs text-gray-400">
                    {t.type} · {t.smtpHost}:{t.smtpPort}
                    {t.smtpSecure ? ' · TLS' : ''}
                  </span>
                  {t.isDefault && (
                    <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      default
                    </span>
                  )}
                  {!t.isActive && <span className="ml-2 text-xs text-gray-400">inactive</span>}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {!t.isDefault && (
                    <form action={setDefaultTransport}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="text-brand hover:underline">Set default</button>
                    </form>
                  )}
                  <form action={toggleTransport}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className={t.isActive ? 'text-amber-600' : 'text-green-600'}>
                      {t.isActive ? 'Disable' : 'Enable'}
                    </button>
                  </form>
                  <form action={deleteTransport}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-red-500 hover:underline">Delete</button>
                  </form>
                </div>
              </div>
              {/* Test send */}
              <div className="mt-3 border-t pt-3">
                <ModuleActionForm
                  action={sendTestEmail}
                  submitLabel="Send test"
                  successText="Sent!"
                  className="flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="id" value={t.id} />
                  <input name="from" placeholder="from@inboxi.online" className="w-48 rounded border px-2 py-1 text-sm" />
                  <input name="to" placeholder="to@example.com" className="w-56 rounded border px-2 py-1 text-sm" />
                </ModuleActionForm>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Per-domain assignment */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Per-domain delivery</h2>
        <table className="w-full overflow-hidden rounded-lg border bg-white text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-400">
            <tr>
              <th className="p-3">Domain</th>
              <th className="p-3">Transport (blank = default)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {domains.map((d) => (
              <tr key={d.id}>
                <td className="p-3 font-mono">{d.name}</td>
                <td className="p-3">
                  <form action={assignDomainTransport} className="flex items-center gap-2">
                    <input type="hidden" name="domainId" value={d.id} />
                    <select
                      name="transportId"
                      defaultValue={d.deliveryConfig?.transportId ?? ''}
                      className="rounded border px-2 py-1 text-xs"
                    >
                      <option value="">— use default —</option>
                      {transports.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <button className="text-xs text-brand hover:underline">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
