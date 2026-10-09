export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

export interface TelegramOptions {
  botToken: string;
  fetchImpl?: typeof fetch;
}

/** One inline-keyboard button: either a link or a one-tap "copy to clipboard". */
export interface TelegramButton {
  text: string;
  url?: string;
  copyText?: string;
}

export interface TelegramSendExtra {
  /** Inline keyboard, as rows of buttons. */
  buttons?: TelegramButton[][];
  /** Deliver without a notification sound. */
  silent?: boolean;
}

function toReplyMarkup(rows: TelegramButton[][] | undefined) {
  const inline_keyboard = (rows ?? [])
    .map((row) =>
      row
        .filter((b) => b.copyText || b.url)
        .map((b) =>
          b.copyText ? { text: b.text, copy_text: { text: b.copyText } } : { text: b.text, url: b.url },
        ),
    )
    .filter((row) => row.length > 0);
  return inline_keyboard.length > 0 ? { inline_keyboard } : undefined;
}

// What a plain-text retry shows when Telegram cannot parse the HTML: tags
// dropped, entities restored, so the message still arrives and stays readable.
function toPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Send a message via the Telegram Bot API. fetch is injectable for tests.
//
// A message is never lost to presentation: if Telegram rejects the markup
// ("can't parse entities") it is retried as plain text, and if it rejects the
// buttons (an unreachable URL, say) it is retried without them.
export async function sendTelegramMessage(
  opts: TelegramOptions,
  chatId: string,
  text: string,
  extra: TelegramSendExtra = {},
): Promise<TelegramSendResult> {
  const f = opts.fetchImpl ?? fetch;
  const url = `https://api.telegram.org/bot${opts.botToken}/sendMessage`;

  const attempt = async (body: Record<string, unknown>): Promise<TelegramSendResult> => {
    try {
      const res = await f(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; description?: string };
      return data.ok ? { ok: true } : { ok: false, error: data.description ?? 'telegram_error' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'telegram_error' };
    }
  };

  const base = {
    chat_id: chatId,
    link_preview_options: { is_disabled: true },
    ...(extra.silent ? { disable_notification: true } : {}),
  };
  const markup = toReplyMarkup(extra.buttons);

  let result = await attempt({
    ...base,
    text,
    parse_mode: 'HTML',
    ...(markup ? { reply_markup: markup } : {}),
  });

  if (!result.ok && markup && /button|url|copy/i.test(result.error ?? '')) {
    result = await attempt({ ...base, text, parse_mode: 'HTML' });
  }
  if (!result.ok && /parse entities|unsupported start tag|can't find end/i.test(result.error ?? '')) {
    result = await attempt({
      ...base,
      text: toPlainText(text),
      ...(markup ? { reply_markup: markup } : {}),
    });
  }
  return result;
}
