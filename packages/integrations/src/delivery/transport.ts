import nodemailer, { type Transporter } from 'nodemailer';
import type { DeliveryResult, OutgoingMessage, TransportConfig } from './types';

// Build a nodemailer transporter for a transport config. The TEST_STREAM kind
// produces the raw MIME without sending — used in tests and dry-runs.
function buildTransporter(cfg: TransportConfig): Transporter {
  if (cfg.kind === 'TEST_STREAM') {
    return nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  }
  if (!cfg.smtp) {
    throw new Error(`Transport "${cfg.name}" (${cfg.kind}) requires SMTP config`);
  }
  return nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure ?? cfg.smtp.port === 465,
    auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
  });
}

// Deliver a single message through one transport, signing with DKIM when the
// message carries a key. Never throws — failures are returned as results so the
// caller can run a failover chain.
export async function deliverVia(
  cfg: TransportConfig,
  msg: OutgoingMessage,
): Promise<DeliveryResult> {
  try {
    const transporter = buildTransporter(cfg);
    const info = await transporter.sendMail({
      from: msg.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      headers: msg.headers,
      dkim: msg.dkim
        ? {
            domainName: msg.dkim.domainName,
            keySelector: msg.dkim.keySelector,
            privateKey: msg.dkim.privateKey,
          }
        : undefined,
    });

    const raw =
      cfg.kind === 'TEST_STREAM' && info.message
        ? Buffer.isBuffer(info.message)
          ? info.message.toString('utf8')
          : String(info.message)
        : undefined;

    return {
      ok: true,
      transport: cfg.name,
      messageId: info.messageId,
      response: info.response,
      raw,
    };
  } catch (err) {
    return {
      ok: false,
      transport: cfg.name,
      error: err instanceof Error ? err.message : 'send failed',
    };
  }
}

// Try transports in order until one succeeds (failover chain).
export async function deliverWithFailover(
  chain: TransportConfig[],
  msg: OutgoingMessage,
): Promise<DeliveryResult> {
  let last: DeliveryResult = { ok: false, transport: 'none', error: 'no transports configured' };
  for (const cfg of chain) {
    last = await deliverVia(cfg, msg);
    if (last.ok) return last;
  }
  return last;
}
