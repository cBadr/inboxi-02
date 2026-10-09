import { getSetting } from './settings';
import { sendTelegramMessage } from '@inboxi/integrations/telegram';

// Operator alerting — pages the PLATFORM OWNER, never a customer.
//
// The monitors used to find their recipient with
//   prisma.integration.findFirst({ where: { kind: 'TELEGRAM', isActive: true } })
// but Integration.userId is a per-CUSTOMER field, so that query would happily
// pick a customer's chat and send them our domain names and failing auth checks.
// The owner's chat lives in the global Setting store instead, where no customer
// can ever land in the result set.

export type AlertOutcome =
  | { delivered: true }
  | { delivered: false; reason: 'no_bot_token' | 'no_chat_id' | 'send_failed'; detail?: string };

/**
 * Send an alert to the platform owner.
 *
 * Never throws — monitors must finish their run even when paging fails. The
 * returned outcome says exactly why nothing was delivered so the caller can put
 * it in its JSON response; a silently misconfigured monitor is the failure mode
 * this whole module exists to prevent.
 */
export async function sendOperatorAlert(text: string): Promise<AlertOutcome> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return { delivered: false, reason: 'no_bot_token' };

  const chatId = (await getSetting('alerts.telegramChatId')).trim();
  if (!chatId) return { delivered: false, reason: 'no_chat_id' };

  try {
    const res = await sendTelegramMessage({ botToken }, chatId, text);
    return res.ok ? { delivered: true } : { delivered: false, reason: 'send_failed', detail: res.error };
  } catch (err) {
    return {
      delivered: false,
      reason: 'send_failed',
      detail: err instanceof Error ? err.message : 'unknown',
    };
  }
}

// --- Inbound mail mirror ----------------------------------------------------
//
// Mirrors every message received on a watched domain to the owner's chat, body
// included. Same recipient as the monitors above (the global alert chat), so it
// can never reach a customer.

// Telegram rejects messages over 4096 characters (counted after entity parsing).
const TELEGRAM_MAX_CHARS = 4096;
const MIRROR_BUDGET = 3900;

export interface MirroredMail {
  from: string;
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  attachmentCount: number;
}

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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatMirroredMail(mail: MirroredMail, domain: string, target: string): string {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const head =
    `📨 <b>New mail on ${escapeHtml(domain)}</b>` +
    (target === 'catch-all' ? ' (catch-all)' : target === 'anonymous' ? ' (temp inbox)' : '') +
    `\n<b>From:</b> ${escapeHtml(clip(mail.from, 200))}` +
    `\n<b>To:</b> ${escapeHtml(clip(mail.to, 200))}` +
    `\n<b>Subject:</b> ${escapeHtml(clip(mail.subject?.trim() || '(no subject)', 300))}`;
  const foot = mail.attachmentCount > 0 ? `\n\n📎 ${mail.attachmentCount} attachment(s)` : '';

  const rawBody = (mail.text?.trim() || (mail.html ? htmlToText(mail.html) : '')).trim();
  const budget = Math.min(MIRROR_BUDGET, TELEGRAM_MAX_CHARS) - head.length - foot.length - 8;

  // Escaping grows the text, so shrink the raw slice until the escaped form fits.
  let keep = Math.max(0, Math.min(rawBody.length, budget));
  let body = escapeHtml(rawBody.slice(0, keep));
  while (body.length > budget && keep > 0) {
    keep = Math.floor(keep * 0.8);
    body = escapeHtml(rawBody.slice(0, keep));
  }
  const truncated = keep < rawBody.length ? '\n…(truncated)' : '';

  return `${head}\n\n${body || '(empty body)'}${truncated}${foot}`;
}

/**
 * Mirror one inbound message to the owner when its domain is on the watch list.
 * Never throws and returns nothing — ingestion must not wait on, or fail
 * because of, Telegram.
 */
export async function notifyAdminOfInbound(
  mail: MirroredMail,
  domain: string,
  target: string,
): Promise<void> {
  try {
    const watch = parseWatchList(await getSetting('alerts.watchDomains'));
    if (watch.length === 0 || !isWatchedDomain(domain, watch)) return;
    await sendOperatorAlert(formatMirroredMail(mail, domain, target));
  } catch {
    // Deliberately swallowed: a failed mirror must never break mail intake.
  }
}

/** Whether operator alerting is fully wired — surfaced in Admin → Settings. */
export async function alertingStatus(): Promise<{
  configured: boolean;
  hasBotToken: boolean;
  hasChatId: boolean;
}> {
  const hasBotToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const hasChatId = Boolean((await getSetting('alerts.telegramChatId')).trim());
  return { configured: hasBotToken && hasChatId, hasBotToken, hasChatId };
}
