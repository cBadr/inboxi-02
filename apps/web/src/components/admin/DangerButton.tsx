'use client';

import { useActionState, useRef } from 'react';

interface Result {
  ok: boolean;
  error?: string;
}

type Action = (prev: Result | null, formData: FormData) => Promise<Result>;

/**
 * A destructive action that asks before it fires and speaks when it refuses.
 *
 * Two failure modes this exists to close:
 *  - one-click deletes with no confirmation, on records that cascade
 *  - server actions that guard with a bare `return`, so a refusal is
 *    indistinguishable from success — the button does nothing, says nothing
 *
 * `confirmText` should name the specific record and what goes with it, not ask
 * a generic "Are you sure?".
 */
export function DangerButton({
  action,
  confirmText,
  label = 'Delete',
  pendingLabel = 'Deleting…',
  hidden,
  className,
}: {
  action: Action;
  confirmText: string;
  label?: string;
  pendingLabel?: string;
  /** Extra hidden fields, e.g. `{ id: domain.id }`. */
  hidden?: Record<string, string>;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<Result | null, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={formAction}
      className={className ?? 'flex items-center gap-2'}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? pendingLabel : label}
      </button>
      {state?.error && (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
