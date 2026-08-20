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
