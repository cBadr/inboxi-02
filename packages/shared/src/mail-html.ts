// Rendering an inbound email's raw HTML directly would hand the sender a
// same-origin script execution primitive inside our own page. The message is
// instead shown in a sandboxed iframe with no scripts, and this module builds
// the srcdoc: it strips the sender's own <base>/<script> tags (so they can't
// hijack relative links or smuggle script back in even though the sandbox
// already blocks scripts), forces every link to open in a new tab, and never
// throws — a malformed inbound message must still render as *something*.

/** sandbox flags for the message iframe: popups only, never scripts or same-origin. */
export const MESSAGE_IFRAME_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox';

// 16px on phones is the floor for body text; desktops can afford the slightly
// tighter 15px. Only unstyled mail is affected — a sender's own CSS still wins.
const MESSAGE_STYLE =
  'body{margin:0;padding:14px;background:#fff;font:16px/1.65 system-ui,sans-serif;' +
  'color:#111827;word-break:break-word}' +
  '@media(min-width:768px){body{font-size:15px}}' +
  'img{max-width:100%;height:auto}a{color:#4f46e5}';

const INJECTED_HEAD =
  '<meta charset="utf-8"><meta name="referrer" content="no-referrer"><base target="_blank">' +
  `<style>${MESSAGE_STYLE}</style>`;

const FALLBACK_DOC = '<!doctype html><html><head></head><body></body></html>';

/**
 * Re-run a replacement until it stops changing the input. A single pass is
 * defeated by nesting — `<ba<base href="x">se href="x">` reassembles into a
 * live tag the moment the inner match is removed. Capped so a pathological
 * message cannot spin here.
 */
function repeatUntilStable(input: string, transform: (value: string) => string): string {
  let current = input;
  for (let pass = 0; pass < 5; pass += 1) {
    const next = transform(current);
    if (next === current) return current;
    current = next;
  }
  return current;
}

/**
 * Remove what a sender could use to take the document back:
 * `<script>` (belt and braces — the sandbox already blocks it), `<base>` (would
 * re-point relative links), and their own `<meta name="referrer">` (the last
 * such tag wins, so leaving it lets them undo our no-referrer and read the
 * mailbox and message ids out of the Referer header).
 */
function stripDangerousTags(html: string): string {
  return repeatUntilStable(html, (value) =>
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script\b[^>]*\/?>/gi, '')
      .replace(/<base\b[^>]*\/?>/gi, '')
      .replace(/<meta\b[^>]*\bname\s*=\s*["']?referrer["']?[^>]*>/gi, ''),
  );
}

/**
 * `<base target="_blank">` is only a default: an anchor carrying its own
 * `target="_self"` still navigates this frame, which would render the sender's
 * page inside our chrome on our own URL. Take the choice away from them.
 */
function stripTargetAttributes(html: string): string {
  return html.replace(/<(?:a|area|form)\b[^>]*>/gi, (tag) =>
    tag.replace(/\starget\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ''),
  );
}

/** Insert `insertion` right after the first tag matching `openTagRe`, if any. */
function injectAfterOpenTag(source: string, openTagRe: RegExp, insertion: string): string {
  const match = openTagRe.exec(source);
  if (!match) return source;
  const tag = match[0] ?? '';
  const idx = (match.index ?? 0) + tag.length;
  return source.slice(0, idx) + insertion + source.slice(idx);
}

/** Wrap an email's HTML body in a document that opens every link in a new tab. */
export function buildMessageSrcDoc(html: string): string {
  try {
    const source = typeof html === 'string' ? html : '';
    // Comments go first: `<!-- <head> -->` would otherwise win the <head> probe
    // below and our whole injected head would land inside a comment, silently
    // disabling the base tag with nothing appearing to fail.
    const withoutComments = source.replace(/<!--[\s\S]*?-->/g, '');
    const cleaned = stripTargetAttributes(stripDangerousTags(withoutComments));

    const hasHead = /<head[\s>]/i.test(cleaned);
    const hasHtml = /<html[\s>]/i.test(cleaned);

    // The body already has a document: inject into its existing <head> rather
    // than nesting a second <!doctype html> document inside it.
    if (hasHead) {
      return injectAfterOpenTag(cleaned, /<head[^>]*>/i, INJECTED_HEAD);
    }
    if (hasHtml) {
      return injectAfterOpenTag(cleaned, /<html[^>]*>/i, `<head>${INJECTED_HEAD}</head>`);
    }
    return `<!doctype html><html><head>${INJECTED_HEAD}</head><body>${cleaned}</body></html>`;
  } catch {
    return FALLBACK_DOC;
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LINK_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/gi;
const EMAIL_ONLY_RE = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/i;
const CLOSER_BY_OPENER: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

function countChar(source: string, char: string): number {
  let count = 0;
  for (const c of source) if (c === char) count += 1;
  return count;
}

/** Split trailing sentence punctuation and unbalanced closers off a matched token. */
function splitTrailingPunctuation(raw: string): { url: string; trailing: string } {
  let url = raw;
  let trailing = '';

  const punctMatch = /[.,!?;:]+$/.exec(url);
  if (punctMatch) {
    const removed = punctMatch[0] ?? '';
    url = url.slice(0, url.length - removed.length);
    trailing = removed + trailing;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [opener, closer] of Object.entries(CLOSER_BY_OPENER)) {
      if (url.endsWith(closer) && countChar(url, closer) > countChar(url, opener)) {
        url = url.slice(0, -1);
        trailing = closer + trailing;
        changed = true;
      }
    }
  }

  return { url, trailing };
}

/** Escape a plain-text body, then turn bare URLs and emails into new-tab links. */
export function linkifyPlainText(text: string): string {
  const escaped = escapeHtml(typeof text === 'string' ? text : '');
  return escaped.replace(LINK_RE, (match) => {
    const { url, trailing } = splitTrailingPunctuation(match);
    if (!url) return match;

    if (EMAIL_ONLY_RE.test(url)) {
      // No target here on purpose: a mailto handed to a new tab leaves the
      // reader staring at a blank page once their mail client opens.
      return `<a href="mailto:${url}" rel="noopener noreferrer nofollow">${url}</a>${trailing}`;
    }

    const href = /^www\./i.test(url) ? `https://${url}` : url;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>${trailing}`;
  });
}
