import { requireAdmin } from '@/lib/session';
import { getGtmState } from '@/lib/google';
import { ModuleActionForm } from '@/components/ModuleActionForm';
import { saveGtmSettings, verifyGtmLive } from '../google-actions';

export const dynamic = 'force-dynamic';

// The other Google services this section will grow into. Listed rather than
// hidden so the section reads as the one place these live, and so it is obvious
// which are wired and which are not yet.
const PLANNED = [
  {
    name: 'Google Analytics 4',
    detail: 'Measurement ID, or leave it to a GA4 tag inside Tag Manager.',
  },
  {
    name: 'Search Console',
    detail: 'Site verification and indexing status. Needs OAuth.',
  },
  {
    name: 'Business Profile',
    detail: 'Business listing and reviews. Needs OAuth.',
  },
  {
    name: 'Google Ads',
    detail: 'Conversion tracking and campaign stats. Needs OAuth.',
  },
];

export default async function AdminGooglePage() {
  await requireAdmin();
  const gtm = await getGtmState();
  const live = gtm.isActive && gtm.config;

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h1 className="text-2xl font-bold">Google services</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect the Google products the site uses. Everything here is owned by the platform, not
          by a customer account.
        </p>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Tag Manager</h2>
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-medium ${
              live ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {live ? 'Live' : 'Off'}
          </span>
        </div>
        <p className="mb-4 text-xs text-gray-500">
          Loads your GTM container on the site. Tags, triggers and variables are then managed inside
          Tag Manager itself &mdash; this page controls whether the container loads and where.
        </p>

        <ModuleActionForm
          action={saveGtmSettings}
          submitLabel="Save"
          successText="Saved."
          className="space-y-4"
        >
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={gtm.isActive}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Load Tag Manager on the site</span>
              <span className="block text-xs text-gray-500">
                Turn off to remove the container without losing the ID.
              </span>
            </span>
          </label>

          <label className="block text-sm">
            <span className="text-gray-600">Container ID</span>
            <input
              name="containerId"
              placeholder="GTM-ABC1234"
              defaultValue={gtm.config?.containerId ?? ''}
              className="mt-1 w-full rounded border px-3 py-2 font-mono"
            />
            <span className="mt-1 block text-xs text-gray-500">
              Find it at the top of your GTM workspace, next to the container name.
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="includeAppPages"
              defaultChecked={gtm.config?.includeAppPages ?? false}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Also load on the admin panel and customer dashboard</span>
              <span className="block text-xs text-gray-500">
                Off by default. Leaving it off keeps your own console sessions out of the numbers,
                and keeps third-party tag code off pages that render customer mail.
              </span>
            </span>
          </label>
        </ModuleActionForm>

        <div className="mt-3">
          <ModuleActionForm
            action={verifyGtmLive}
            submitLabel="Check it's live"
            successText="Confirmed — the container is in the served homepage."
            className="rounded border bg-gray-50 p-4"
          >
            <p className="text-xs text-gray-500">
              Fetches the public homepage and confirms the container ID is really in the HTML
              visitors receive.
            </p>
          </ModuleActionForm>
        </div>

        {gtm.updatedAt && (
          <p className="mt-3 text-[11px] text-gray-400">
            Last changed {gtm.updatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Not connected yet</h2>
        <ul className="divide-y rounded-lg border bg-white">
          {PLANNED.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-700">{p.name}</div>
                <div className="text-xs text-gray-500">{p.detail}</div>
              </div>
              <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                Planned
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
