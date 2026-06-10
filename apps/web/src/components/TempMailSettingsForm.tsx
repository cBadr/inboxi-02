'use client';

import { useActionState } from 'react';
import { updateTempMailSettings, type ActionResult } from '@/app/admin/actions';

interface Props {
  patternType: string;
  length: number;
  destructionMinutes: number;
  gateAfter: number;
}

export function TempMailSettingsForm({ patternType, length, destructionMinutes, gateAfter }: Props) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    updateTempMailSettings,
    null,
  );

  return (
    <form action={formAction} className="max-w-md space-y-4 rounded-lg border bg-white p-6">
      <label className="block text-sm">
        <span className="text-gray-600">Address pattern</span>
        <select
          name="patternType"
          defaultValue={patternType}
          className="mt-1 w-full rounded border px-3 py-2"
        >
          <option value="alphanumeric">Alphanumeric</option>
          <option value="letters">Letters only</option>
          <option value="numeric">Numbers only</option>
          <option value="words">Words</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-gray-600">Length</span>
        <input
          type="number"
          name="length"
          defaultValue={length}
          min={4}
          max={32}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-gray-600">Destruction timer (minutes)</span>
        <input
          type="number"
          name="destructionMinutes"
          defaultValue={destructionMinutes}
          min={5}
          max={1440}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-gray-600">Gate after N messages</span>
        <input
          type="number"
          name="gateAfter"
          defaultValue={gateAfter}
          min={1}
          max={50}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
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
