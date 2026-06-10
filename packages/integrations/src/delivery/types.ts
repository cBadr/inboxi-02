export type TransportKind = 'SELF_HOST' | 'SMTP_RELAY' | 'TEST_STREAM';

export interface DkimConfig {
  domainName: string;
  keySelector: string;
  privateKey: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
}

export interface TransportConfig {
  name: string;
  kind: TransportKind;
  smtp?: SmtpConfig; // required for SMTP_RELAY / SELF_HOST
}

export interface OutgoingMessage {
  from: string;
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  dkim?: DkimConfig;
}

export interface DeliveryResult {
  ok: boolean;
  transport: string;
  messageId?: string;
  response?: string;
  raw?: string; // populated by the TEST_STREAM transport
  error?: string;
}
