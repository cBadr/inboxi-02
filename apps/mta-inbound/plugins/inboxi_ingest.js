'use strict';

// Haraka plugin: on queue, read the received message, parse it, and forward it
// to the Inboxi web ingest endpoint. Recipients are already accepted by
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

  // Haraka's message_stream must be consumed via get_data() (it pipes
  // internally); attaching raw 'data'/'end' listeners does not flow and the
  // hook would hang. get_data() yields the full raw MIME as a Buffer.
  txn.message_stream.get_data(async (buf) => {
    let parsed;
    try {
      parsed = await simpleParser(buf);
    } catch (err) {
      connection.logerror(plugin, `parse failed: ${err.message}`);
      return next(DENYSOFT, 'temporary parse failure');
    }

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
};
