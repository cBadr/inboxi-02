// Professional attachment display: inline thumbnails for images, a typed file
// card with size + download for everything else. Server-renderable (links only).

export interface AttachmentView {
  id: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number;
  hasContent: boolean; // bytes available to serve/download
}

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileBadge(filename: string, contentType: string | null): string {
  const ext = filename.split('.').pop()?.toUpperCase();
  if (ext && ext.length <= 4) return ext;
  if (contentType?.includes('pdf')) return 'PDF';
  if (contentType?.startsWith('image/')) return 'IMG';
  return 'FILE';
}

export function AttachmentList({ attachments }: { attachments: AttachmentView[] }) {
  if (attachments.length === 0) return null;

  const images = attachments.filter(
    (a) => a.hasContent && (a.contentType ?? '').startsWith('image/'),
  );
  const files = attachments.filter((a) => !images.includes(a));

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {attachments.length} attachment{attachments.length === 1 ? '' : 's'}
      </div>

      {/* image thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((a) => (
            <a
              key={a.id}
              href={`/api/attachments/${a.id}`}
              target="_blank"
              rel="noreferrer"
              className="group relative block overflow-hidden rounded-lg border bg-gray-50"
              title={a.filename}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/attachments/${a.id}`}
                alt={a.filename}
                className="h-28 w-28 object-cover transition group-hover:opacity-90"
              />
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                {a.filename}
              </span>
            </a>
          ))}
        </div>
      )}

      {/* non-image files */}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2.5 rounded-lg border bg-white px-3 py-2 text-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-brand/10 text-[10px] font-bold text-brand">
                {fileBadge(a.filename, a.contentType)}
              </span>
              <div className="min-w-0">
                <div className="max-w-[200px] truncate font-medium text-gray-700">{a.filename}</div>
                <div className="text-xs text-gray-400">
                  {formatBytes(a.sizeBytes)}
                  {!a.hasContent && ' · not stored'}
                </div>
              </div>
              {a.hasContent && (
                <a
                  href={`/api/attachments/${a.id}?download=1`}
                  className="ml-1 shrink-0 rounded p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-brand"
                  title="Download"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="M7 10l5 5 5-5" />
                    <path d="M12 15V3" />
                  </svg>
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
