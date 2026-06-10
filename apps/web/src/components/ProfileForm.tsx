'use client';

import { useActionState } from 'react';
import { updateProfile, type ActionResult } from '@/app/dashboard/actions';

export function ProfileForm({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    updateProfile,
    null,
  );
  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-sm">
        <span className="text-gray-600">Display name</span>
        <input
          name="name"
          defaultValue={name}
          className="mt-1 w-full rounded border px-3 py-2"
          placeholder="Your name"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-4 py-2 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      {state?.ok && <span className="ml-3 text-sm text-green-600">Saved.</span>}
    </form>
  );
}
