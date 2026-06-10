'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { autoFixDns } from '@/app/admin/actions';

export function FixDnsButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          setDone(false);
          const fd = new FormData();
          fd.set('id', id);
          await autoFixDns(fd);
          setDone(true);
          router.refresh();
          setTimeout(() => setDone(false), 3000);
        })
      }
      className="inline-flex items-center gap-2 rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
    >
      {pending && (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      )}
      {pending ? 'Fixing…' : done ? '✓ Fixed' : '⚡ Fix DNS automatically'}
    </button>
  );
}
