import { prisma } from '@inboxi/db';
import { formatInboundMail, isWatchedDomain, parseWatchList } from '@inboxi/shared';
import type { InboundMailView } from '@inboxi/shared';
import { sendTelegramMessage, type TelegramButton } from '@inboxi/integrations/telegram';
import { getSetting } from './settings';

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

/** A formatted alert: HTML text plus optional inline-keyboard rows. */
export interface OperatorMessage {
  text: string;
  buttons?: TelegramButton[][];
  /** Deliver without a notification sound. */
  silent?: boolean;
}

/**
 * Absolute admin URL for `path`, or undefined when the public site URL is unknown
 * or local — Telegram refuses link buttons that point at localhost.
 */
export function adminLink(path: string): string | undefined {
  const base = (process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base) || /localhost|127\.0\.0\.1|\[::1\]/i.test(base)) return undefined;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Send an alert to the platform owner.
 *
 * Never throws — monitors must finish their run even when paging fails. The
 * returned outcome says exactly why nothing was delivered so the caller can put
 * it in its JSON response; a silently misconfigured monitor is the failure mode
 * this whole module exists to prevent.
 */
export async function sendOperatorAlert(message: string | OperatorMessage): Promise<AlertOutcome> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return { delivered: false, reason: 'no_bot_token' };

  const chatId = (await getSetting('alerts.telegramChatId')).trim();
  if (!chatId) return { delivered: false, reason: 'no_chat_id' };

  const { text, buttons, silent } = typeof message === 'string' ? { text: message } : message;
  try {
    const res = await sendTelegramMessage({ botToken }, chatId, text, { buttons, silent });
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
// can never reach a customer. The layout lives in @inboxi/shared/telegram-format.

export type MirroredMail = Pick<
  InboundMailView,
  'from' | 'to' | 'subject' | 'text' | 'html' | 'attachments'
>;

/**
 * Mirror one stored inbound message to the owner when its domain is watched.
 * Never throws and returns nothing — ingestion must not wait on, or fail
 * because of, Telegram.
 */
export async function notifyAdminOfInbound(
  mail: MirroredMail,
  ctx: { domain: string; target: string; messageId?: string },
): Promise<void> {
  try {
    const watch = parseWatchList(await getSetting('alerts.watchDomains'));
    if (watch.length === 0 || !isWatchedDomain(ctx.domain, watch)) return;

    // Only a watched domain pays for this lookup.
    let adminUrl: string | undefined;
    if (ctx.messageId) {
      const domain = await prisma.domain.findUnique({
        where: { name: ctx.domain },
        select: { id: true },
      });
      if (domain) adminUrl = adminLink(`/admin/inboxes/${domain.id}/${ctx.messageId}`);
    }

    const view = formatInboundMail({ ...mail, domain: ctx.domain, target: ctx.target, adminUrl });
    await sendOperatorAlert(view);
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
