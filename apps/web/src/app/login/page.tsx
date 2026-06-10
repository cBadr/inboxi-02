import { Suspense } from 'react';
import { AuthForm } from '@/components/AuthForm';

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
      <p className="mt-4 text-sm text-gray-500">
        No account?{' '}
        <a href="/signup" className="text-brand underline">
          Sign up
        </a>
      </p>
    </div>
  );
}
