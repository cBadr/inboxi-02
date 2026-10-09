import { describe, it, expect } from 'vitest';
import { sendTelegramMessage } from '../index';

describe('sendTelegramMessage', () => {
  it('posts to the bot API and reports success', async () => {
    let captured: { url: string; body: unknown } | null = null;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      captured = { url, body: JSON.parse(String(init?.body)) };
      return { json: async () => ({ ok: true }) } as Response;
    }) as unknown as typeof fetch;

    const r = await sendTelegramMessage({ botToken: 'TOKEN', fetchImpl }, '12345', 'Hello');
    expect(r.ok).toBe(true);
    expect(captured!.url).toContain('/botTOKEN/sendMessage');
    expect((captured!.body as { chat_id: string }).chat_id).toBe('12345');
  });

  it('sends buttons as an inline keyboard, including copy_text buttons', async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return { json: async () => ({ ok: true }) } as Response;
    }) as unknown as typeof fetch;

    await sendTelegramMessage({ botToken: 'T', fetchImpl }, '1', '<b>x</b>', {
      silent: true,
      buttons: [[{ text: 'Copy', copyText: '123456' }], [{ text: 'Open', url: 'https://a.com' }]],
    });
    expect(body.disable_notification).toBe(true);
    expect(body.reply_markup).toEqual({
      inline_keyboard: [
        [{ text: 'Copy', copy_text: { text: '123456' } }],
        [{ text: 'Open', url: 'https://a.com' }],
      ],
    });
  });

  it('retries as plain text when Telegram cannot parse the markup', async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return {
        json: async () =>
          bodies.length === 1
            ? { ok: false, description: "Bad Request: can't parse entities: Unsupported start tag" }
            : { ok: true },
      } as Response;
    }) as unknown as typeof fetch;

    const r = await sendTelegramMessage({ botToken: 'T', fetchImpl }, '1', '<b>a &lt; b</b>');
    expect(r.ok).toBe(true);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]!.parse_mode).toBeUndefined();
    expect(bodies[1]!.text).toBe('a < b');
  });

  it('retries without buttons when Telegram rejects them', async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return {
        json: async () =>
          bodies.length === 1
            ? { ok: false, description: 'Bad Request: BUTTON_URL_INVALID' }
            : { ok: true },
      } as Response;
    }) as unknown as typeof fetch;

    const r = await sendTelegramMessage({ botToken: 'T', fetchImpl }, '1', 'hi', {
      buttons: [[{ text: 'Open', url: 'http://localhost' }]],
    });
    expect(r.ok).toBe(true);
    expect(bodies[1]!.reply_markup).toBeUndefined();
    expect(bodies[1]!.parse_mode).toBe('HTML');
  });

  it('surfaces API errors', async () => {
    const fetchImpl = (async () =>
      ({ json: async () => ({ ok: false, description: 'chat not found' }) }) as Response) as unknown as typeof fetch;
    const r = await sendTelegramMessage({ botToken: 'T', fetchImpl }, '1', 'x');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('chat not found');
  });
});
