export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

export interface TelegramOptions {
  botToken: string;
  fetchImpl?: typeof fetch;
}

// Send a message via the Telegram Bot API. fetch is injectable for tests.
export async function sendTelegramMessage(
  opts: TelegramOptions,
  chatId: string,
  text: string,
): Promise<TelegramSendResult> {
  const f = opts.fetchImpl ?? fetch;
  try {
    const res = await f(`https://api.telegram.org/bot${opts.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    return data.ok ? { ok: true } : { ok: false, error: data.description ?? 'telegram_error' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'telegram_error' };
  }
}
