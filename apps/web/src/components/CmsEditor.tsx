'use client';

import { useState } from 'react';
import { setCmsContent } from '@/app/admin/module-actions';

interface Block {
  type: string;
  props: Record<string, string>;
}

const BLOCK_TYPES: Array<{ type: string; label: string; fields: Array<{ key: string; label: string; textarea?: boolean }> }> = [
  { type: 'heading', label: 'Heading', fields: [{ key: 'text', label: 'Text' }] },
  { type: 'text', label: 'Paragraph', fields: [{ key: 'text', label: 'Text', textarea: true }] },
  { type: 'image', label: 'Image', fields: [{ key: 'src', label: 'Image URL' }, { key: 'alt', label: 'Alt text' }] },
  { type: 'button', label: 'Button', fields: [{ key: 'label', label: 'Label' }, { key: 'href', label: 'Link' }] },
  { type: 'html', label: 'Raw HTML', fields: [{ key: 'html', label: 'HTML', textarea: true }] },
  { type: 'ad', label: 'Ad slot', fields: [{ key: 'zone', label: 'Zone key' }] },
];

function fieldsFor(type: string) {
  return BLOCK_TYPES.find((b) => b.type === type)?.fields ?? [];
}

export function CmsEditor({ pageId, initialBlocks }: { pageId: string; initialBlocks: Block[] }) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [addType, setAddType] = useState('heading');
  const [saved, setSaved] = useState(false);

  const update = (i: number, key: string, value: string) =>
    setBlocks((bs) => bs.map((b, idx) => (idx === i ? { ...b, props: { ...b.props, [key]: value } } : b)));

  const move = (i: number, dir: -1 | 1) =>
    setBlocks((bs) => {
      const j = i + dir;
      if (j < 0 || j >= bs.length) return bs;
      const copy = [...bs];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });

  const remove = (i: number) => setBlocks((bs) => bs.filter((_, idx) => idx !== i));
  const add = () => setBlocks((bs) => [...bs, { type: addType, props: {} }]);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {blocks.map((b, i) => (
          <div key={i} className="rounded-lg border bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-gray-400">{b.type}</span>
              <div className="flex gap-1 text-xs">
                <button type="button" onClick={() => move(i, -1)} className="rounded border px-1.5 hover:bg-gray-50">↑</button>
                <button type="button" onClick={() => move(i, 1)} className="rounded border px-1.5 hover:bg-gray-50">↓</button>
                <button type="button" onClick={() => remove(i)} className="rounded border border-red-200 px-1.5 text-red-500 hover:bg-red-50">✕</button>
              </div>
            </div>
            <div className="space-y-2">
              {fieldsFor(b.type).map((f) => (
                <label key={f.key} className="block text-sm">
                  <span className="text-xs text-gray-500">{f.label}</span>
                  {f.textarea ? (
                    <textarea
                      value={b.props[f.key] ?? ''}
                      onChange={(e) => update(i, f.key, e.target.value)}
                      rows={3}
                      className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                    />
                  ) : (
                    <input
                      value={b.props[f.key] ?? ''}
                      onChange={(e) => update(i, f.key, e.target.value)}
                      className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
        {blocks.length === 0 && <p className="text-sm text-gray-400">No blocks yet — add one below.</p>}
      </div>

      <div className="flex items-center gap-2">
        <select value={addType} onChange={(e) => setAddType(e.target.value)} className="rounded border px-2 py-1.5 text-sm">
          {BLOCK_TYPES.map((b) => (
            <option key={b.type} value={b.type}>
              {b.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={add} className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50">
          + Add block
        </button>
      </div>

      <form action={setCmsContent} onSubmit={() => setSaved(true)}>
        <input type="hidden" name="id" value={pageId} />
        <input type="hidden" name="content" value={JSON.stringify(blocks)} />
        <button className="rounded bg-brand px-4 py-2 text-sm text-white hover:bg-brand-dark">
          Save content
        </button>
        {saved && <span className="ml-3 text-sm text-green-600">Saving…</span>}
      </form>
    </div>
  );
}
