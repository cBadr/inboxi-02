import { describe, it, expect } from 'vitest';
import { buildPayload, forward } from '../lib/forward.js';

const parsedSample = {
  from: { value: [{ address: 'alice@example.com' }] },
  subject: 'Hi there',
  text: 'Hello world',
  html: '<p>Hello world</p>',
  messageId: '<abc@example.com>',
  attachments: [
    { filename: 'a.pdf', contentType: 'application/pdf', size: 12, contentDisposition: 'attachment' },
  ],
};

describe('buildPayload', () => {
  it('maps parsed fields to the ingest payload', () => {
    const p = buildPayload(parsedSample, 'USER@INBOXI.ONLINE', { rawSizeBytes: 100 });
    expect(p.from).toBe('alice@example.com');
    expect(p.to).toBe('user@inboxi.online'); // lowercased
    expect(p.subject).toBe('Hi there');
    expect(p.rawSizeBytes).toBe(100);
    expect(p.attachments).toHaveLength(1);
    expect(p.attachments[0]).toMatchObject({ filename: 'a.pdf', sizeBytes: 12, isInline: false });
  });

  it('falls back when from is missing', () => {
    const p = buildPayload({}, 'x@inboxi.online');
    expect(p.from).toBe('unknown@unknown.invalid');
    expect(p.attachments).toEqual([]);
  });
});

describe('forward', () => {
  it('posts JSON with the ingest secret header', async () => {
    let captured;
    const fetchImpl = async (url, init) => {
      captured = { url, init };
      return { ok: true, status: 200, json: async () => ({ stored: true, target: 'anonymous' }) };
    };
    const res = await forward({ to: 'x@inboxi.online' }, {
      ingestUrl: 'http://test/api/mail/inbound',
      secret: 's3cr3t',
      fetchImpl,
    });
    expect(res.ok).toBe(true);
    expect(captured.init.headers['x-ingest-secret']).toBe('s3cr3t');
    expect(JSON.parse(captured.init.body).to).toBe('x@inboxi.online');
  });
});
