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

  it('surfaces API errors', async () => {
    const fetchImpl = (async () =>
      ({ json: async () => ({ ok: false, description: 'chat not found' }) }) as Response) as unknown as typeof fetch;
    const r = await sendTelegramMessage({ botToken: 'T', fetchImpl }, '1', 'x');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('chat not found');
  });
});
