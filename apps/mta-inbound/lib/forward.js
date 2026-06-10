'use strict';

// Pure helpers for turning a parsed inbound message into the ingest payload and
// forwarding it to the web app. Kept free of Haraka globals so it is unit
// testable on any platform.

/**
 * Build the ingest payload from a mailparser result + envelope recipient.
 * @param {object} parsed - mailparser output
 * @param {string} recipient - the envelope RCPT TO address
 * @param {object} [opts]
 * @param {number} [opts.rawSizeBytes]
 * @param {string} [opts.rawRef]
 */
function buildPayload(parsed, recipient, opts = {}) {
  const from =
    (parsed.from && parsed.from.value && parsed.from.value[0] && parsed.from.value[0].address) ||
    'unknown@unknown.invalid';

  // Inline attachment bytes up to this size are forwarded (base64) so the web
  // app can store + serve them. Larger attachments forward as metadata only.
  const INLINE_CAP = 10 * 1024 * 1024; // 10 MB per attachment
  const attachments = Array.isArray(parsed.attachments)
    ? parsed.attachments.map((a) => {
        const size = a.size || (a.content ? a.content.length : 0);
        const hasBytes = Buffer.isBuffer(a.content) && a.content.length > 0;
        return {
          filename: a.filename || 'attachment',
          contentType: a.contentType || undefined,
          sizeBytes: size,
          isInline: a.contentDisposition === 'inline',
          contentBase64:
            hasBytes && a.content.length <= INLINE_CAP ? a.content.toString('base64') : undefined,
        };
      })
    : [];

  return {
    from,
    to: String(recipient || '').toLowerCase(),
    subject: parsed.subject || undefined,
    text: parsed.text || undefined,
    html: parsed.html || undefined,
    messageId: parsed.messageId || undefined,
    rawSizeBytes: opts.rawSizeBytes || 0,
    rawRef: opts.rawRef || undefined,
    attachments,
  };
}

/**
 * POST a payload to the web ingest endpoint.
 * @param {object} payload
 * @param {object} opts
 * @param {string} opts.ingestUrl
 * @param {string} opts.secret
 * @param {Function} [opts.fetchImpl] - injectable fetch (defaults to global fetch)
 */
async function forward(payload, opts) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const res = await fetchImpl(opts.ingestUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ingest-secret': opts.secret,
    },
    body: JSON.stringify(payload),
  });
  const ok = res.ok;
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { ok, status: res.status, body };
}

module.exports = { buildPayload, forward };
