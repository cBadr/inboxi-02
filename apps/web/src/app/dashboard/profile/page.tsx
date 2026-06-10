import { requireUser } from '@/lib/session';
import { ProfileForm } from '@/components/ProfileForm';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <div>
      <h1 className="text-2xl font-bold">Profile</h1>
      <div className="mt-4 max-w-md rounded-lg border bg-white p-6">
        <div className="mb-4 text-sm text-gray-500">
          Email: <span className="font-medium text-gray-800">{user.email}</span>
        </div>
        <ProfileForm name={user.name ?? ''} />
      </div>
    </div>
  );
}
