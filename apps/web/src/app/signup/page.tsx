import { Suspense } from 'react';
import { AuthForm } from '@/components/AuthForm';

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">Create your free account</h1>
      <p className="mt-1 text-sm text-gray-600">Unlock withheld messages and keep your inboxes.</p>
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </div>
  );
}
