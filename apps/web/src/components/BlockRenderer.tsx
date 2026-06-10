// Renders the CMS page-builder block tree. Each block is `{ type, props }`.
// Kept intentionally small; new block types are added here.

import { AdSlot } from './AdSlot';

export interface Block {
  type: string;
  props?: Record<string, unknown>;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  return (
    <div className="prose mx-auto max-w-2xl px-4 py-8">
      {blocks.map((b, i) => {
        const p = b.props ?? {};
        switch (b.type) {
          case 'heading':
            return (
              <h2 key={i} className="text-2xl font-bold">
                {asString(p.text)}
              </h2>
            );
          case 'text':
            return (
              <p key={i} className="mt-2 text-gray-700">
                {asString(p.text)}
              </p>
            );
          case 'image':
            // eslint-disable-next-line @next/next/no-img-element
            return <img key={i} src={asString(p.src)} alt={asString(p.alt)} className="my-4 rounded" />;
          case 'button':
            return (
              <a
                key={i}
                href={asString(p.href) || '#'}
                className="my-3 inline-block rounded bg-brand px-4 py-2 text-white"
              >
                {asString(p.label) || 'Learn more'}
              </a>
            );
          case 'html':
            return <div key={i} dangerouslySetInnerHTML={{ __html: asString(p.html) }} />;
          case 'ad':
            return <AdSlot key={i} zone={asString(p.zone)} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
