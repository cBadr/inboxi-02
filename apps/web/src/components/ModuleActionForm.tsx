'use client';

import { useActionState } from 'react';

interface Result {
  ok: boolean;
  error?: string;
}

type Action = (prev: Result | null, formData: FormData) => Promise<Result>;

// Generic wrapper around a `(prev, formData) => Result` server action that shows
// pending state and success/error feedback. Form fields are passed as children.
export function ModuleActionForm({
  action,
  submitLabel,
  children,
  className,
  successText = 'Saved.',
}: {
  action: Action;
  submitLabel: string;
  children: React.ReactNode;
  className?: string;
  successText?: string;
}) {
  const [state, formAction, pending] = useActionState<Result | null, FormData>(action, null);
  return (
    <form action={formAction} className={className ?? 'space-y-3 rounded-lg border bg-white p-4'}>
      {children}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-green-600">{successText}</span>}
      </div>
    </form>
  );
}
