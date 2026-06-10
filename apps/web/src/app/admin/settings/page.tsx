import { requireAdmin } from '@/lib/session';
import { getSetting } from '@/lib/settings';
import { TempMailSettingsForm } from '@/components/TempMailSettingsForm';
import { ModuleActionForm } from '@/components/ModuleActionForm';
import { saveGeneralSettings } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [pattern, destruction, gate, siteName, maxSize] = await Promise.all([
    getSetting('tempmail.addressPattern'),
    getSetting('tempmail.destructionMinutes'),
    getSetting('tempmail.gateAfterMessages'),
    getSetting('site.name'),
    getSetting('mail.maxMessageSizeMb'),
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
