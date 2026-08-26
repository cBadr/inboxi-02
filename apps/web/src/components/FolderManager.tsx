'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  createFolder,
  deleteFolder,
  renameFolder,
  setFolderColor,
  type ActionResult,
} from '@/app/dashboard/folder-actions';
import { FOLDER_COLORS, folderChipClass, type FolderOption } from '@/lib/folders';

interface Props {
  folders: FolderOption[];
}

export function FolderManager({ folders }: Props) {
  return (
    <div className="space-y-6">
      <CreateFolderForm />
      <ul className="divide-y rounded-lg border bg-white">
        {folders.length === 0 && (
          <li className="p-6 text-center text-sm text-gray-500">No folders yet.</li>
        )}
        {folders.map((folder) => (
          <FolderRow key={folder.id} folder={folder} />
        ))}
      </ul>
    </div>
  );
}

function CreateFolderForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createFolder,
    null,
  );

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4"
    >
      <label className="block text-sm">
        <span className="text-gray-600">New folder</span>
        <input
          type="text"
          name="name"
          maxLength={40}
          required
          placeholder="e.g. Invoices"
          className="mt-1 w-56 rounded border px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-gray-600">Color</span>
        <select name="color" defaultValue="" className="mt-1 rounded border px-3 py-2">
          <option value="">None</option>
          {FOLDER_COLORS.map((color) => (
            <option key={color} value={color}>
              {(color[0] ?? '').toUpperCase()}
              {color.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-4 py-2 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create folder'}
      </button>
      {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  );
}

function FolderRow({ folder }: { folder: FolderOption }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    renameFolder,
    null,
  );

  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2 py-0.5 text-xs ring-1 ${folderChipClass(folder.color)}`}
          >
            {folder.color ?? 'none'}
          </span>

          {editing ? (
            <form action={formAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={folder.id} />
              <input
                type="text"
                name="name"
                defaultValue={folder.name}
                maxLength={40}
                required
                autoFocus
                className="rounded border px-2 py-1 text-sm"
              />
              <button
                type="submit"
                disabled={pending}
                className="text-sm text-brand hover:underline"
              >
                {pending ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-sm text-gray-500 hover:underline"
              >
                Cancel
              </button>
            </form>
          ) : (
            <span className="font-medium">{folder.name}</span>
          )}

          <span className="text-xs text-gray-400">
            <a
              href={`/dashboard/folders/${folder.id}`}
              className="hover:text-brand hover:underline"
            >
              {folder.count ?? 0} message{(folder.count ?? 0) === 1 ? '' : 's'}
            </a>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm text-gray-500 hover:underline"
            >
              Rename
            </button>
          )}

          <form action={setFolderColor} className="flex items-center gap-1">
            <input type="hidden" name="id" value={folder.id} />
            <select
              name="color"
              defaultValue={folder.color ?? ''}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="rounded border px-2 py-1 text-xs"
            >
              <option value="">No color</option>
              {FOLDER_COLORS.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </form>

          <form
            action={deleteFolder}
            onSubmit={(e) => {
              const ok = window.confirm(
                `Delete "${folder.name}"? This does not delete its messages — they just become unfiled.`,
              );
              if (!ok) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={folder.id} />
            <button type="submit" className="text-sm text-red-500 hover:underline">
              Delete
            </button>
          </form>
        </div>
      </div>
      {state?.error && <p className="mt-1 text-sm text-red-600">{state.error}</p>}
    </li>
  );
}
