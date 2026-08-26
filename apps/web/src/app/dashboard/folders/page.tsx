import { requireUser } from '@/lib/session';
import { listUserFolders } from '@/lib/folders';
import { FolderManager } from '@/components/FolderManager';

export const dynamic = 'force-dynamic';

export default async function FoldersPage() {
  const user = await requireUser();
  const folders = await listUserFolders(user.id);

  return (
    <div>
      <h1 className="text-2xl font-bold">Folders</h1>
      <p className="mt-1 text-sm text-gray-500">
        A folder is yours, not one address&apos;s — file messages from any mailbox into it.
        Deleting a folder never deletes messages; they just become unfiled.
      </p>

      <div className="mt-4">
        <FolderManager folders={folders} />
      </div>
    </div>
  );
}
