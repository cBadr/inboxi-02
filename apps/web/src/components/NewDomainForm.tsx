'use client';

import { useActionState } from 'react';
import { createDomain, type ActionResult } from '@/app/admin/actions';

export function NewDomainForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createDomain,
    null,
  );
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border bg-white p-4">
      <input
        name="name"
        required
        placeholder="example.com"
        className="w-52 rounded border px-2 py-1.5 text-sm"
      />
      <select name="availability" className="rounded border px-2 py-1.5 text-sm">
        <option value="FREE">Free</option>
        <option value="ASSIGNED_USER">Assigned (user)</option>
        <option value="ASSIGNED_GROUP">Assigned (group)</option>
        <option value="DISABLED">Disabled</option>
      </select>
      <select name="dnsProvider" className="rounded border px-2 py-1.5 text-sm">
        <option value="CLOUDFLARE_PLATFORM">Cloudflare (platform)</option>
        <option value="CLOUDFLARE_DELEGATED">Cloudflare (delegated)</option>
        <option value="EXTERNAL_MANUAL">External (manual)</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {pending ? 'Adding…' : 'Add domain'}
      </button>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="w-full text-sm text-green-600">Domain added.</p>}
    </form>
  );
}
