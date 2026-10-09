// Presentation of Telegram messages: pure functions, no I/O, so the layout is
// unit-testable. Output targets the Bot API's `parse_mode: 'HTML'`, which gives
// us bold/italic, tap-to-copy <code>, collapsible <blockquote expandable> and
// inline-keyboard buttons (URL buttons and one-tap "copy" buttons).

import { extractCodes } from './otp';

// Telegram rejects messages over 4096 characters.
const MAX_CHARS = 4096;
// A tidy preview matters more than showing everything; the admin link has the rest.
const BODY_CAP = 2600;

export interface TelegramButton {
  text: string;
  /** Opens a link. */
  url?: string;
  /** Copies this text to the clipboard on tap (no link). */
  copyText?: string;
}

export interface FormattedTelegramMessage {
  text: string;
  /** Inline keyboard, as rows of buttons. */
  buttons?: TelegramButton[][];
}

// --- primitives --------------------------------------------------------------

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** `https://very.long/path?token=…` → `very.long/path…` for a readable preview. */
export function shortenUrl(url: string, max = 48): string {
  try {
    const u = new URL(url);
    const short = `${u.host}${u.pathname === '/' ? '' : u.pathname}`;
    return short.length > max ? `${short.slice(0, max - 1)}…` : `${short}${u.search ? '…' : ''}`;
  } catch {
    return clip(url, max);
  }
}

/** Tidy a message body for a chat preview: collapse whitespace, shorten long URLs. */
export function compactBody(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/https?:\/\/\S+/g, (u) => (u.length > 60 ? shortenUrl(u) : u))
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// --- watch list --------------------------------------------------------------

/** `"A.com, b.com;*"` → `['a.com', 'b.com', '*']`. */
export function parseWatchList(raw: string): string[] {
  return raw
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((d) => d.trim())
    .filter(Boolean);
}

export function isWatchedDomain(domain: string, watchList: string[]): boolean {
  return watchList.includes('*') || watchList.includes(domain.toLowerCase());
}

// --- links -------------------------------------------------------------------

const ACTION_LINK_RE =
  /verify|confirm|activate|validate|magic|sign[-_]?in|log[-_]?in|reset|password|token|auth/i;
const NOISE_LINK_RE = /unsubscribe|opt[-_]?out|preferences|privacy|terms/i;

/** Distinct http(s) links in a message, HTML hrefs first. Capped to Telegram's URL limit. */
export function extractLinks(input: { text?: string; html?: string }): string[] {
  const found: string[] = [];
  const add = (raw: string) => {
    const url = raw.replace(/&amp;/g, '&').replace(/[)>.,;'"]+$/, '');
    if (/^https?:\/\//i.test(url) && url.length <= 1000 && !found.includes(url)) found.push(url);
  };
  for (const m of (input.html ?? '').matchAll(/href\s*=\s*["']([^"']+)["']/gi)) add(m[1] ?? '');
  for (const m of (input.text ?? '').matchAll(/https?:\/\/[^\s<>"']+/gi)) add(m[0]);
  return found;
}

/** The link a reader most likely wants (verify / confirm / reset …), if any. */
export function pickActionLink(links: string[]): string | undefined {
  return links.find((l) => ACTION_LINK_RE.test(l) && !NOISE_LINK_RE.test(l));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return clip(url, 30);
  }
}

// --- inbound mail ------------------------------------------------------------

export interface InboundMailView {
  from: string;
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  attachments: { filename: string; sizeBytes: number; isInline: boolean }[];
  domain: string;
  /** Which ingest path stored it: 'mailbox' | 'anonymous' | 'catch-all'. */
  target: string;
  /** Deep link to this message in the admin, when the site URL is known. */
  adminUrl?: string;
}

const TARGET_LABEL: Record<string, string> = {
  mailbox: 'mailbox',
  anonymous: 'temp inbox',
  'catch-all': 'catch-all',
};

const MAX_LISTED_ATTACHMENTS = 5;
// `<blockquote expandable></blockquote>` plus the joining blank line and a margin.
const QUOTE_OVERHEAD = 40;

export function formatInboundMail(v: InboundMailView): FormattedTelegramMessage {
  const tag = TARGET_LABEL[v.target];
  const header = [
    `📨 <b>New mail</b>  ·  <code>${escapeHtml(v.domain)}</code>`,
    tag ? `<i>${tag}</i>` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const subject = v.subject?.trim();
  const meta = [
    `👤 <b>From:</b> <code>${escapeHtml(clip(v.from, 200))}</code>`,
    `📬 <b>To:</b> <code>${escapeHtml(clip(v.to, 200))}</code>`,
    `📝 <b>Subject:</b> ${subject ? escapeHtml(clip(subject, 300)) : '<i>(no subject)</i>'}`,
  ].join('\n');

  const otp = extractCodes({ subject: v.subject, text: v.text, html: v.html }, 1)[0];
  const codeBlock = otp
    ? `🔑 <b>${otp.confidence === 'high' ? 'Verification code' : 'Possible code'}</b>\n<code>${escapeHtml(otp.code)}</code>`
    : '';

  const files = v.attachments.filter((a) => !a.isInline);
  const attachmentLines: string[] = [];
  if (files.length > 0) {
    attachmentLines.push(`📎 <b>Attachments (${files.length})</b>`);
    for (const f of files.slice(0, MAX_LISTED_ATTACHMENTS)) {
      attachmentLines.push(
        `• <code>${escapeHtml(clip(f.filename, 60))}</code> · ${formatBytes(f.sizeBytes)}`,
      );
    }
    if (files.length > MAX_LISTED_ATTACHMENTS) {
      attachmentLines.push(`• …and ${files.length - MAX_LISTED_ATTACHMENTS} more`);
    }
  }
  const attachments = attachmentLines.join('\n');

  const fixed = [header, meta, codeBlock, attachments].filter(Boolean).join('\n\n');
  const rawBody = compactBody(v.text?.trim() || (v.html ? htmlToText(v.html) : ''));
  const budget = Math.min(BODY_CAP, MAX_CHARS - fixed.length - QUOTE_OVERHEAD);

  let bodyBlock = '';
  if (rawBody && budget >= 80) {
    // Escaping grows the text, so shrink the raw slice until the escaped form fits.
    let keep = Math.min(rawBody.length, budget);
    let escaped = escapeHtml(rawBody.slice(0, keep));
    while (escaped.length > budget && keep > 0) {
      keep = Math.floor(keep * 0.8);
      escaped = escapeHtml(rawBody.slice(0, keep));
    }
    const more = keep < rawBody.length ? '…' : '';
    bodyBlock = `<blockquote expandable>${escaped}${more}</blockquote>`;
  } else if (!rawBody) {
    bodyBlock = '<i>(empty body)</i>';
  }

  // Body goes between the code and the attachments, so a reader sees what the
  // mail says before the file list.
  const text = [header, meta, codeBlock, bodyBlock, attachments].filter(Boolean).join('\n\n');

  const buttons: TelegramButton[][] = [];
  if (otp) buttons.push([{ text: `📋 Copy code ${otp.code}`, copyText: otp.code }]);

  const link = pickActionLink(extractLinks({ text: v.text, html: v.html }));
  const row: TelegramButton[] = [];
  if (link) row.push({ text: `🔗 ${clip(hostOf(link), 28)}`, url: link });
  if (v.adminUrl) row.push({ text: '🖥 Open in admin', url: v.adminUrl });
  if (row.length > 0) buttons.push(row);

  return buttons.length > 0 ? { text, buttons } : { text };
}

// --- operator alerts ---------------------------------------------------------

export type AlertSeverity = 'critical' | 'warning' | 'ok' | 'info';

const SEVERITY_ICON: Record<AlertSeverity, string> = {
  critical: '🚨',
  warning: '⚠️',
  ok: '✅',
  info: 'ℹ️',
};

export interface OperatorAlertView {
  severity: AlertSeverity;
  title: string;
  subtitle?: string;
  rows?: { label: string; value: string; strong?: boolean }[];
  note?: string;
  /** Link buttons, e.g. "Open Delivery". */
  links?: { text: string; url: string }[];
}

export function formatOperatorAlert(v: OperatorAlertView): FormattedTelegramMessage {
  const parts: string[] = [
    [`${SEVERITY_ICON[v.severity]} <b>${escapeHtml(v.title)}</b>`, v.subtitle ? `<i>${escapeHtml(v.subtitle)}</i>` : '']
      .filter(Boolean)
      .join('\n'),
  ];

  if (v.rows && v.rows.length > 0) {
    parts.push(
      v.rows
        .map((r) => {
          const value = escapeHtml(r.value);
          return `▪️ <b>${escapeHtml(r.label)}:</b> ${r.strong ? `<b>${value}</b>` : value}`;
        })
        .join('\n'),
    );
  }
  if (v.note) parts.push(`<blockquote>${escapeHtml(v.note)}</blockquote>`);

  const text = clip(parts.join('\n\n'), MAX_CHARS);
  const buttons = (v.links ?? []).map((l) => ({ text: l.text, url: l.url }));
  return buttons.length > 0 ? { text, buttons: [buttons] } : { text };
}

// --- customer notification (default template) --------------------------------

/** Default `mail.received` text for a customer. Values must already be HTML-escaped. */
export const DEFAULT_CUSTOMER_MAIL_TEMPLATE =
  '📬 <b>New mail</b>\n' +
  '<b>To:</b> <code>{{mailbox.address}}</code>\n' +
  '<b>From:</b> {{message.from}}\n' +
  '<b>Subject:</b> {{message.subject}}';
