import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { ModuleActionForm } from '@/components/ModuleActionForm';
import { createCmsPage, togglePublish } from '../module-actions';

export const dynamic = 'force-dynamic';

export default async function AdminCmsPage() {
  await requireAdmin();
  const pages = await prisma.cmsPage.findMany({ orderBy: { createdAt: 'desc' } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">CMS</h1>
        <p className="mt-1 text-sm text-gray-500">
          Build pages from content blocks, rendered at <code>/p/&lt;slug&gt;</code>.
        </p>
      </div>

      <div className="max-w-md">
        <h2 className="mb-2 text-sm font-semibold">New page</h2>
        <ModuleActionForm action={createCmsPage} submitLabel="Create page">
          <input name="slug" placeholder="slug (a-z0-9-)" className="w-full rounded border px-2 py-1.5 text-sm" />
          <input name="title" placeholder="Title" className="w-full rounded border px-2 py-1.5 text-sm" />
        </ModuleActionForm>
      </div>

      <table className="w-full overflow-hidden rounded-lg border bg-white text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-400">
          <tr>
            <th className="p-3">Title</th>
            <th className="p-3">URL</th>
            <th className="p-3">Status</th>
            <th className="p-3">Updated</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {pages.length === 0 && (
            <tr>
              <td colSpan={5} className="p-6 text-center text-gray-400">
                No pages yet.
              </td>
            </tr>
          )}
          {pages.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="p-3 font-medium">{p.title}</td>
              <td className="p-3 font-mono text-xs">
                <Link href={`/p/${p.slug}`} className="text-brand hover:underline" target="_blank">
                  /p/{p.slug}
                </Link>
              </td>
              <td className="p-3">
                {p.isPublished ? (
                  <span className="text-green-600">published</span>
                ) : (
                  <span className="text-gray-400">draft</span>
                )}
              </td>
              <td className="p-3 text-xs text-gray-400">{p.updatedAt.toLocaleDateString()}</td>
              <td className="p-3">
                <div className="flex items-center gap-3">
                  <Link href={`/admin/cms/${p.id}`} className="text-xs text-brand hover:underline">
                    Edit →
                  </Link>
                  <form action={togglePublish}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="text-xs text-gray-500 hover:underline">
                      {p.isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
