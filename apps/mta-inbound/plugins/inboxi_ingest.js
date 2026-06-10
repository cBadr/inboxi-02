'use strict';

// Haraka plugin: on queue, parse the received message and forward it to the
// Inboxi web ingest endpoint. Recipients are already accepted by
// rcpt_to.in_host_list (catch-all for our active domains).

const { simpleParser } = require('mailparser');
const { buildPayload, forward } = require('../lib/forward');

exports.register = function () {
  this.load_inboxi_config();
};

exports.load_inboxi_config = function () {
  this.cfg = {
    ingestUrl: process.env.MAIL_INGEST_URL || 'http://127.0.0.1:3000/api/mail/inbound',
    secret: process.env.MAIL_INGEST_SECRET || '',
  };
};

exports.hook_queue = function (next, connection) {
  const plugin = this;
  const txn = connection.transaction;
  if (!txn) return next();

  const raw = txn.message_stream;
  const chunks = [];
  raw.on('data', (chunk) => chunks.push(chunk));
  raw.on('end', async () => {
    const buf = Buffer.concat(chunks);
    let parsed;
    try {
      parsed = await simpleParser(buf);
    } catch (err) {
      connection.logerror(plugin, `parse failed: ${err.message}`);
      return next(DENYSOFT, 'temporary parse failure');
    }

    // One delivery per envelope recipient.
    const recipients = txn.rcpt_to.map((r) => r.address());
    try {
      for (const rcpt of recipients) {
        const payload = buildPayload(parsed, rcpt, { rawSizeBytes: buf.length });
        const result = await forward(payload, {
          ingestUrl: plugin.cfg.ingestUrl,
          secret: plugin.cfg.secret,
        });
        if (!result.ok) {
          connection.logerror(plugin, `ingest rejected (${result.status}) for ${rcpt}`);
        } else {
          connection.loginfo(plugin, `ingested ${rcpt} -> ${result.body && result.body.target}`);
        }
      }
      return next(OK);
    } catch (err) {
      connection.logerror(plugin, `forward error: ${err.message}`);
      return next(DENYSOFT, 'temporary ingest failure');
    }
  });
  raw.on('error', (err) => {
    connection.logerror(plugin, `stream error: ${err.message}`);
    next(DENYSOFT, 'stream error');
  });
};
