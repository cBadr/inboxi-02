import { prisma } from '@inboxi/db';

export interface FolderOption {
  id: string;
  name: string;
  color: string | null;
  /** Messages currently filed here, when the caller asked for counts. */
  count?: number;
}

/**
 * A fixed palette rather than free-form colour input: Tailwind compiles the
 * classes it can see in the source, so a colour assembled at runtime
 * (`bg-${color}-100`) produces no CSS at all. Every class below is written out
 * in full for that reason.
 */
export const FOLDER_COLORS = ['indigo', 'cyan', 'emerald', 'amber', 'rose', 'violet'] as const;
export type FolderColor = (typeof FOLDER_COLORS)[number];

const CHIP: Record<FolderColor, string> = {
  indigo: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
  cyan: 'bg-cyan-100 text-cyan-700 ring-cyan-200',
  emerald: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-100 text-amber-800 ring-amber-200',
  rose: 'bg-rose-100 text-rose-700 ring-rose-200',
  violet: 'bg-violet-100 text-violet-700 ring-violet-200',
};

const CHIP_DEFAULT = 'bg-gray-100 text-gray-600 ring-gray-200';

export function folderChipClass(color: string | null | undefined): string {
  if (!color) return CHIP_DEFAULT;
  return CHIP[color as FolderColor] ?? CHIP_DEFAULT;
}

export function isFolderColor(value: string): value is FolderColor {
  return (FOLDER_COLORS as readonly string[]).includes(value);
}

/** A user's folders in display order, with how many messages sit in each. */
export async function listUserFolders(userId: string): Promise<FolderOption[]> {
  const folders = await prisma.folder.findMany({
    where: { userId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { messages: true } } },
  });
  return folders.map((f) => ({
    id: f.id,
    name: f.name,
    color: f.color,
    count: f._count.messages,
  }));
}
