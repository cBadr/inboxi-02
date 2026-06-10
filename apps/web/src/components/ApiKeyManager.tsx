'use client';

import { useActionState } from 'react';
import { createApiKey, type ActionResult } from '@/app/dashboard/actions';

export function ApiKeyManager() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createApiKey,
    null,
  );
  return (
    <div className="rounded-lg border bg-white p-4">
      <form action={formAction} className="flex items-end gap-2">
        <input
          name="name"
          placeholder="Key name (e.g. CI tests)"
          className="w-56 rounded border px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create API key'}
        </button>
      </form>
      {state?.plaintext && (
        <div className="mt-3 rounded bg-amber-50 p-3 text-sm">
          <p className="mb-1 font-medium text-amber-800">
            Copy your key now — it won&apos;t be shown again:
          </p>
          <code className="block break-all rounded bg-white p-2 font-mono text-xs">
            {state.plaintext}
          </code>
        </div>
      )}
    </div>
  );
}
