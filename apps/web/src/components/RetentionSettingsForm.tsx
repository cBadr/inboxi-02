'use client';

import { useActionState } from 'react';
import { saveRetentionSettings, type ActionResult } from '@/app/admin/actions';

interface Props {
  retentionDays: number;
  orphanRetentionDays: number;
}

export function RetentionSettingsForm({ retentionDays, orphanRetentionDays }: Props) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveRetentionSettings,
    null,
  );

  return (
    <form action={formAction} className="max-w-md space-y-4 rounded-lg border bg-white p-6">
      <label className="block text-sm">
        <span className="text-gray-600">Default retention (days)</span>
        <input
          type="number"
          name="retentionDays"
          defaultValue={retentionDays}
          min={0}
          max={3650}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-gray-600">Orphan mail retention (days)</span>
        <input
          type="number"
          name="orphanRetentionDays"
          defaultValue={orphanRetentionDays}
          min={0}
          max={3650}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <p className="text-xs text-gray-500">
        A subscriber&apos;s plan retention always wins over the default above. Either field set to{' '}
        <strong>0</strong> means keep forever. The retention job runs hourly and requires Redis on
        the server.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-4 py-2 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save settings'}
      </button>
      {state?.error && <span className="ml-3 text-sm text-red-600">{state.error}</span>}
      {state?.ok && <span className="ml-3 text-sm text-green-600">Saved.</span>}
    </form>
  );
}
