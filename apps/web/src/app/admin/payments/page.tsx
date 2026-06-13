import { requireAdmin } from '@/lib/session';
import {
  GATEWAYS,
  CREDENTIAL_FIELDS,
  getGatewayConfig,
  credentialStatus,
} from '@/lib/payments-config';
import { saveGateways, saveGatewayAccount } from '../payment-actions';

export const dynamic = 'force-dynamic';

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const cfg = await getGatewayConfig();
  const statuses = Object.fromEntries(
    await Promise.all(GATEWAYS.map(async (g) => [g.provider, await credentialStatus(g.provider)] as const)),
  ) as Record<string, Record<string, boolean>>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payment gateways</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure gateway accounts, choose which appear at checkout, and set the default. Secrets
          are encrypted at rest; leave a field blank to keep its current value.
        </p>
      </div>

      {/* enable / default */}
      <form action={saveGateways} className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">Availability</h2>
        {GATEWAYS.map((g) => (
          <div key={g.provider} className="flex items-center justify-between rounded-xl border bg-white p-3">
            <label className="flex items-center gap-3">
              <input type="checkbox" name={`enabled_${g.provider}`} defaultChecked={cfg.enabled[g.provider]} className="h-4 w-4" />
              <span className="font-medium text-gray-900">{g.label}</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <input type="radio" name="default" value={g.provider} defaultChecked={cfg.default === g.provider} />
              default
            </label>
          </div>
        ))}
        <button className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          Save availability
        </button>
      </form>

      {/* per-gateway accounts */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Accounts &amp; credentials</h2>
        {GATEWAYS.map((g) => {
          const st = statuses[g.provider] ?? {};
          const configured = Object.values(st).some(Boolean);
          return (
            <form key={g.provider} action={saveGatewayAccount} className="rounded-xl border bg-white p-4">
              <input type="hidden" name="provider" value={g.provider} />
              <div className="mb-3 flex items-center gap-2">
                <span className="font-medium text-gray-900">{g.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${configured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {configured ? 'configured' : 'not set'}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {CREDENTIAL_FIELDS[g.provider].map((f) => (
                  <label key={f.key} className="block text-sm">
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      {f.label}
                      {st[f.key] && <span className="text-[10px] text-green-600">● saved</span>}
                    </span>
                    <input
                      name={f.key}
                      type={f.secret ? 'password' : 'text'}
                      autoComplete="off"
                      placeholder={st[f.key] ? '•••••••• (unchanged)' : 'not set'}
                      className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                    />
                  </label>
                ))}
              </div>
              <button className="mt-3 rounded-lg border px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Save {g.label} account
              </button>
            </form>
          );
        })}
      </div>

      <p className="text-xs text-gray-400">
        NowPayments IPN callback URL: <code className="font-mono">/api/payments/ipn/nowpayments</code>.
        CoinPayments: <code className="font-mono">/api/payments/ipn/coinpayments</code>. Binance Pay:{' '}
        <code className="font-mono">/api/payments/ipn/binancepay</code>.
      </p>
    </div>
  );
}
