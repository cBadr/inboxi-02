import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { ModuleActionForm } from '@/components/ModuleActionForm';
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
  const [transports, domains] = await Promise.all([
    prisma.deliveryTransport.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
    prisma.domain.findMany({
      orderBy: { name: 'asc' },
      include: { deliveryConfig: { include: { transport: true } } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Sending / Delivery</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure how outbound mail is delivered: self-host (Haraka on 25/587/465) or an external
          SMTP relay. Pick a global default and override per domain.
        </p>
      </div>

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
