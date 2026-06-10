import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { requireAdmin } from '@/lib/session';
import { ModuleActionForm } from '@/components/ModuleActionForm';
import { CmsEditor } from '@/components/CmsEditor';
import { updateCmsPageMeta, togglePublish, deleteCmsPage } from '../../module-actions';

export const dynamic = 'force-dynamic';

interface Block {
  type: string;
  props: Record<string, string>;
}

export default async function CmsEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const page = await prisma.cmsPage.findUnique({ where: { id } });
  if (!page) notFound();

  const blocks: Block[] = Array.isArray(page.content)
    ? (page.content as unknown as Block[]).map((b) => ({ type: b.type, props: b.props ?? {} }))
    : [];

  return (
    <div className="max-w-3xl">
      <Link href="/admin/cms" className="text-sm text-gray-500 hover:text-brand">
        ← CMS
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{page.title}</h1>
        {page.isPublished ? (
          <span className="text-xs text-green-600">published</span>
        ) : (
          <span className="text-xs text-gray-400">draft</span>
        )}
        <Link href={`/p/${page.slug}`} className="text-xs text-brand underline" target="_blank">
          Preview /p/{page.slug} ↗
        </Link>
        <form action={togglePublish}>
          <input type="hidden" name="id" value={page.id} />
          <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50">
            {page.isPublished ? 'Unpublish' : 'Publish'}
          </button>
        </form>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Page settings</h2>
          <ModuleActionForm action={updateCmsPageMeta} submitLabel="Save settings">
            <input type="hidden" name="id" value={page.id} />
            <label className="block text-sm">
              <span className="text-gray-600">Title</span>
              <input name="title" defaultValue={page.title} className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">Slug</span>
              <input name="slug" defaultValue={page.slug} className="mt-1 w-full rounded border px-3 py-2" />
            </label>
          </ModuleActionForm>

          <form action={deleteCmsPage} className="mt-3">
            <input type="hidden" name="id" value={page.id} />
            <button className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
              Delete page
            </button>
          </form>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">Content blocks</h2>
          <CmsEditor pageId={page.id} initialBlocks={blocks} />
        </div>
      </div>
    </div>
  );
}
