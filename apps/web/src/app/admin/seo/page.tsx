import { requireAdmin } from '@/lib/session';
import { getSeo } from '@/lib/seo';
import { ModuleActionForm } from '@/components/ModuleActionForm';
import { saveGlobalSeo } from '../module-actions';

export const dynamic = 'force-dynamic';

export default async function AdminSeoPage() {
  await requireAdmin();
  const seo = await getSeo('global');

  return (
    <div>
      <h1 className="text-2xl font-bold">SEO</h1>
      <p className="mt-1 text-sm text-gray-500">Global metadata applied across the site.</p>
      <div className="mt-4 max-w-xl">
        <ModuleActionForm action={saveGlobalSeo} submitLabel="Save SEO">
          <Field name="title" label="Title" defaultValue={seo.title} />
          <Field name="description" label="Description" defaultValue={seo.description} textarea />
          <Field name="keywords" label="Keywords" defaultValue={seo.keywords ?? ''} />
          <Field name="ogImage" label="OG image URL" defaultValue={seo.ogImage ?? ''} />
        </ModuleActionForm>
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  textarea,
}: {
  name: string;
  label: string;
  defaultValue: string;
  textarea?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600">{label}</span>
      {textarea ? (
        <textarea
          name={name}
          defaultValue={defaultValue}
          rows={3}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      ) : (
        <input name={name} defaultValue={defaultValue} className="mt-1 w-full rounded border px-3 py-2" />
      )}
    </label>
  );
}
