import { requireAdmin } from '@/lib/session';
import { getSetting } from '@/lib/settings';
import { alertingStatus } from '@/lib/alerts';
import { TempMailSettingsForm } from '@/components/TempMailSettingsForm';
import { ModuleActionForm } from '@/components/ModuleActionForm';
import { saveGeneralSettings, saveAlertSettings, sendTestAlert } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [pattern, destruction, gate, siteName, maxSize, alertChatId, alerts] = await Promise.all([
    getSetting('tempmail.addressPattern'),
    getSetting('tempmail.destructionMinutes'),
    getSetting('tempmail.gateAfterMessages'),
    getSetting('site.name'),
    getSetting('mail.maxMessageSizeMb'),
    getSetting('alerts.telegramChatId'),
    alertingStatus(),
  ]);

  return (
    <div className="max-w-md space-y-8">
      <section>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Global platform configuration.</p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">General</h2>
        <ModuleActionForm action={saveGeneralSettings} submitLabel="Save general">
          <label className="block text-sm">
            <span className="text-gray-600">Site name</span>
            <input name="siteName" defaultValue={siteName} className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Max message size (MB)</span>
            <input
              name="maxMessageSizeMb"
              type="number"
              min={1}
              max={100}
              defaultValue={maxSize}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
        </ModuleActionForm>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Alerts</h2>
        <p className="mb-2 text-xs text-gray-500">
          Where the platform monitors page <strong>you</strong>. This is deliberately separate from
          the Telegram integration your customers connect for their own mail.
        </p>

        {alerts.configured ? (
          <p className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
            Alerting is active. Deliverability and sending-health problems will reach you.
          </p>
        ) : (
          <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>No alerts are being delivered.</strong>{' '}
            {!alerts.hasBotToken
              ? 'TELEGRAM_BOT_TOKEN is not set on the server.'
              : 'Add your Telegram chat ID below.'}{' '}
            The monitors still run — they just have nowhere to send what they find.
          </p>
        )}

        <ModuleActionForm action={saveAlertSettings} submitLabel="Save alert channel">
          <label className="block text-sm">
            <span className="text-gray-600">Your Telegram chat ID</span>
            <input
              name="alertChatId"
              inputMode="numeric"
              placeholder="123456789"
              defaultValue={alertChatId}
              className="mt-1 w-full rounded border px-3 py-2 font-mono"
            />
            <span className="mt-1 block text-xs text-gray-500">
              Message @userinfobot on Telegram to get yours. Leave empty to disable alerts.
            </span>
          </label>
        </ModuleActionForm>

        <div className="mt-3">
          <ModuleActionForm
            action={sendTestAlert}
            submitLabel="Send test alert"
            successText="Sent — check Telegram."
            className="rounded-lg border bg-white p-4"
          >
            <p className="text-xs text-gray-500">
              Confirm the channel works now, instead of finding out during an incident.
            </p>
          </ModuleActionForm>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Temp-mail engine</h2>
        <p className="mb-2 text-xs text-gray-500">Controls the instant anonymous inbox shown to visitors.</p>
        <TempMailSettingsForm
          patternType={pattern.type}
          length={pattern.length ?? 10}
          destructionMinutes={destruction}
          gateAfter={gate}
        />
      </section>
    </div>
  );
}
