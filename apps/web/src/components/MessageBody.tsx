'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
// Deep import on purpose: this is a client component, and the package barrel
// re-exports temp-address, which imports node:crypto and cannot be bundled for
// the browser.
import {
  MESSAGE_IFRAME_SANDBOX,
  buildMessageSrcDoc,
  linkifyPlainText,
} from '@inboxi/shared/mail-html';

// The reading area is resizable because a message's real height is unknowable
// from out here: the body renders in a sandboxed iframe with neither scripts
// nor same-origin access, so nothing can measure it. Rather than guess one
// height for every message, let the reader set it — and remember the choice.
const MIN_HEIGHT = 220;
const MAX_HEIGHT = 4000;
const DEFAULT_HEIGHT = 520;
const STEP = 80;
const STORAGE_KEY = 'inboxi.messageHeight';

function clamp(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HEIGHT;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(value)));
}

export function MessageBody({ html, text }: { html: string | null; text: string | null }) {
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [maximized, setMaximized] = useState(false);
  const heightRef = useRef(DEFAULT_HEIGHT);
  const restored = useRef(false);
  const userTouched = useRef(false);
  const dragFrom = useRef<{ y: number; height: number } | null>(null);
  const textRef = useRef<HTMLDivElement>(null);

  const applyHeight = useCallback((next: number | ((current: number) => number)) => {
    setHeight((current) => clamp(typeof next === 'function' ? next(current) : next));
  }, []);

  // Only a height the reader chose is worth remembering. Persisting the
  // auto-fitted height of one text message — or the default the first HTML
  // message happens to render at — would pin every later message to it.
  const setByUser = useCallback(
    (next: number | ((current: number) => number)) => {
      userTouched.current = true;
      applyHeight(next);
    },
    [applyHeight],
  );

  useEffect(() => {
    heightRef.current = height;
  }, [height]);

  // Restore the reader's height, or fit a plain-text body to its content the
  // first time — that one we *can* measure, since it is our own DOM.
  useEffect(() => {
    let stored: number | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) stored = Number(raw);
    } catch {
      /* storage blocked — fall through to the default */
    }

    if (stored && Number.isFinite(stored)) {
      applyHeight(stored);
    } else if (textRef.current) {
      const content = textRef.current.scrollHeight + 24;
      applyHeight(Math.min(content, Math.round(window.innerHeight * 0.7)));
    }
    restored.current = true;
  }, [applyHeight]);

  useEffect(() => {
    if (!restored.current || !userTouched.current) return;
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(height));
      } catch {
        /* storage blocked — the height still applies for this visit */
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [height]);

  // Escape must close the overlay here rather than reach the inbox list, which
  // listens on the document and would navigate away from the message instead.
  useEffect(() => {
    if (!maximized) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setMaximized(false);
        return;
      }
      // While full screen, arrows belong to the message: stop them reaching the
      // list (which would jump to another message) but let the browser scroll,
      // so no preventDefault here.
      if (['ArrowUp', 'ArrowDown', 'j', 'k'].includes(event.key)) {
        event.stopPropagation();
      }
    };
    document.addEventListener('keydown', onKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [maximized]);

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragFrom.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onHandleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowDown: STEP,
      ArrowUp: -STEP,
      PageDown: STEP * 3,
      PageUp: -STEP * 3,
    };
    if (event.key in keys) {
      event.preventDefault();
      event.stopPropagation();
      setByUser((current) => current + (keys[event.key] ?? 0));
    } else if (event.key === 'Home') {
      event.preventDefault();
      event.stopPropagation();
      setByUser(MIN_HEIGHT);
    } else if (event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      setByUser(MAX_HEIGHT);
    }
  };

  const body =
    html !== null ? (
      <iframe
        title="Message body"
        // No allow-scripts and no allow-same-origin: the mail stays inert and
        // cannot reach this origin. allow-popups is what lets its links open in
        // a new tab instead of navigating inside this frame.
        sandbox={MESSAGE_IFRAME_SANDBOX}
        referrerPolicy="no-referrer"
        className="h-full w-full bg-white"
        srcDoc={buildMessageSrcDoc(html)}
      />
    ) : text ? (
      <div
        ref={textRef}
        className="h-full overflow-y-auto whitespace-pre-wrap break-words bg-white px-4 py-3 text-base leading-relaxed text-gray-800 [&_a:hover]:underline [&_a]:text-brand md:text-[15px]"
        // linkifyPlainText escapes the body before it linkifies it, so nothing
        // the sender wrote can reach the DOM as markup.
        dangerouslySetInnerHTML={{ __html: linkifyPlainText(text) }}
      />
    ) : (
      <p className="flex h-full items-center justify-center text-sm italic text-gray-500">
        This message has no content.
      </p>
    );

  const toolbar = (
    <div className="flex items-center gap-1 text-gray-500">
      {/* WCAG 2.2 requires a non-drag path to every drag operation, so the
          handle below is an accelerator — these buttons are the real control. */}
      <button
        type="button"
        onClick={() => setByUser((current) => current - STEP)}
        disabled={maximized || height <= MIN_HEIGHT}
        title="Shrink reading area"
        aria-label="Shrink reading area"
        className={iconBtn}
      >
        −
      </button>
      <button
        type="button"
        onClick={() => setByUser((current) => current + STEP)}
        disabled={maximized || height >= MAX_HEIGHT}
        title="Expand reading area"
        aria-label="Expand reading area"
        className={iconBtn}
      >
        +
      </button>
      <button
        type="button"
        onClick={() => setByUser(DEFAULT_HEIGHT)}
        disabled={maximized}
        title="Reset to the default height"
        className="rounded-md px-2 py-1 text-xs font-medium transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
      >
        Reset
      </button>
      <button
        type="button"
        onClick={() => setMaximized((v) => !v)}
        title={maximized ? 'Exit full screen (Esc)' : 'Read full screen'}
        aria-pressed={maximized}
        className="rounded-md px-2 py-1 text-xs font-medium transition hover:bg-gray-100 hover:text-gray-700"
      >
        {maximized ? 'Exit full screen' : 'Full screen'}
      </button>
    </div>
  );

  if (maximized) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white p-3 sm:p-5" role="dialog" aria-modal="true" aria-label="Message, full screen">
        <div className="mb-2 flex items-center justify-end">{toolbar}</div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">{body}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs text-gray-500">{height}px</span>
        {toolbar}
      </div>

      <div className="overflow-hidden rounded-lg border" style={{ height: `${height}px` }}>
        {body}
      </div>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize reading area"
        aria-valuenow={height}
        aria-valuemin={MIN_HEIGHT}
        aria-valuemax={MAX_HEIGHT}
        tabIndex={0}
        onKeyDown={onHandleKeyDown}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragFrom.current = { y: event.clientY, height: heightRef.current };
        }}
        onPointerMove={(event) => {
          const from = dragFrom.current;
          if (!from) return;
          if (event.buttons === 0) {
            endDrag(event);
            return;
          }
          setByUser(from.height + (event.clientY - from.y));
        }}
        onPointerUp={(event) => endDrag(event)}
        // A cancelled pointer (the browser taking over the gesture, a lost
        // window) never sends pointerup; without this the next mousemove over
        // the handle would resume a drag the reader already let go of.
        onPointerCancel={(event) => endDrag(event)}
        className="mx-auto mt-1 flex h-4 w-28 cursor-ns-resize touch-none items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-brand focus-visible:bg-gray-100 focus-visible:text-brand"
      >
        <span aria-hidden="true" className="block h-1 w-10 rounded-full bg-current" />
      </div>
    </div>
  );
}

const iconBtn =
  'h-7 w-7 rounded-md text-base leading-none transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40';
