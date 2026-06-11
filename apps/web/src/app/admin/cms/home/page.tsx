import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { getHomeContent } from '@/lib/home-content';
import { HomeContentEditor } from '@/components/HomeContentEditor';

export const dynamic = 'force-dynamic';

export default async function AdminHomepageEditor() {
  await requireAdmin();
  const content = await getHomeContent();

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link href="/admin/cms" className="text-sm text-gray-500 hover:text-brand">
          ← CMS
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Homepage content</h1>
        <p className="mt-1 text-sm text-gray-500">
          Edit every section of the marketing homepage. Changes go live immediately.
        </p>
      </div>
      <HomeContentEditor initial={content} />
    </div>
  );
}
