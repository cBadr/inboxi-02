'use client';

import { useActionState } from 'react';
import { createMailbox, type ActionResult } from '@/app/dashboard/actions';

interface DomainOption {
  id: string;
  name: string;
}

export function NewMailboxForm({ domains }: { domains: DomainOption[] }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createMailbox,
    null,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border bg-white p-4">
      <div className="flex items-center gap-1">
        <input
          name="localPart"
          required
          placeholder="local-part"
          pattern="[a-zA-Z0-9._\-]+"
          className="w-40 rounded border px-2 py-1.5 text-sm"
        />
        <span className="text-gray-400">@</span>
        <select name="domainId" required className="rounded border px-2 py-1.5 text-sm">
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <input
        name="displayName"
        placeholder="Display name (optional)"
        className="w-44 rounded border px-2 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={pending || domains.length === 0}
        className="rounded bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create mailbox'}
      </button>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="w-full text-sm text-green-600">Mailbox created.</p>}
    </form>
  );
}
