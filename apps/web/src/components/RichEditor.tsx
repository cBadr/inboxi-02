'use client';

import { useEffect, useRef } from 'react';

// Minimal contentEditable rich-text editor with a formatting toolbar. Emits HTML
// via onChange. execCommand is deprecated but universally supported and keeps the
// bundle dependency-free. `insertAtCaret` is exposed to the parent via a ref-like
// callback so variable chips can inject {{tokens}} at the cursor.
export interface RichEditorHandle {
  insert: (text: string) => void;
}

const TOOLS: Array<{ cmd: string; arg?: string; label: string; title: string }> = [
  { cmd: 'bold', label: 'B', title: 'Bold' },
  { cmd: 'italic', label: 'I', title: 'Italic' },
  { cmd: 'underline', label: 'U', title: 'Underline' },
  { cmd: 'formatBlock', arg: 'h2', label: 'H', title: 'Heading' },
  { cmd: 'insertUnorderedList', label: '•', title: 'Bullet list' },
  { cmd: 'insertOrderedList', label: '1.', title: 'Numbered list' },
];

export function RichEditor({
  value,
  onChange,
  handleRef,
  placeholder,
  onFocus,
}: {
  value: string;
  onChange: (html: string) => void;
  handleRef?: (h: RichEditorHandle | null) => void;
  placeholder?: string;
  onFocus?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Keep the DOM in sync only when the external value diverges (e.g. file import),
  // never on every keystroke (which would reset the caret).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  useEffect(() => {
    if (!handleRef) return;
    handleRef({
      insert: (text: string) => {
        ref.current?.focus();
        document.execCommand('insertText', false, text);
        if (ref.current) onChange(ref.current.innerHTML);
      },
    });
    return () => handleRef(null);
  }, [handleRef, onChange]);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const addLink = () => {
    const url = window.prompt('Link URL:', 'https://');
    if (url) exec('createLink', url);
  };

  return (
    <div className="overflow-hidden rounded-lg border focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
      <div className="flex flex-wrap items-center gap-1 border-b bg-gray-50 px-2 py-1.5">
        {TOOLS.map((t) => (
          <button
            key={t.label}
            type="button"
            title={t.title}
            onMouseDown={(e) => {
              e.preventDefault();
              exec(t.cmd, t.arg);
            }}
            className="h-7 min-w-7 rounded px-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-200"
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          title="Insert link"
          onMouseDown={(e) => {
            e.preventDefault();
            addLink();
          }}
          className="h-7 rounded px-1.5 text-sm text-gray-600 hover:bg-gray-200"
        >
          🔗
        </button>
        <button
          type="button"
          title="Clear formatting"
          onMouseDown={(e) => {
            e.preventDefault();
            exec('removeFormat');
          }}
          className="h-7 rounded px-1.5 text-xs text-gray-500 hover:bg-gray-200"
        >
          clear
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onFocus={onFocus}
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        data-placeholder={placeholder}
        className="min-h-[220px] px-3 py-2 text-sm outline-none [&:empty]:before:text-gray-400 [&:empty]:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
}
