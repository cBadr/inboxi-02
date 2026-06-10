'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  };
  return (
    <button onClick={logout} className={className ?? 'text-sm text-gray-500 hover:text-brand'}>
      Sign out
    </button>
  );
}
