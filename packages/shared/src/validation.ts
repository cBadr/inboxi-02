import { z } from 'zod';

// Shared validation schemas used by API routes and forms.

export const emailSchema = z.string().email().max(254);

// Account identity. Signup and login both look the row up with an exact
// findUnique, so the address MUST be normalized identically on both paths:
// otherwise someone who signs up as "Badr@x.com" (or whose phone keyboard
// capitalizes the first letter at the login screen) is told their credentials
// are invalid for an account they own. Trim and lowercase before validating so
// a pasted address with trailing whitespace is accepted rather than rejected as
// a malformed payload.
//
// Deliberately separate from emailSchema, which is used for mail envelope
// addresses — rewriting the case of a recipient the user typed is a different
// decision and is not made here.
export const accountEmailSchema = z.string().trim().toLowerCase().pipe(emailSchema);

export const signupSchema = z.object({
  email: accountEmailSchema,
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120).optional(),
  referralCode: z.string().max(64).optional(),
  anonymousToken: z.string().max(200).optional(), // link an anonymous session on signup
});

export const loginSchema = z.object({
  email: accountEmailSchema,
  password: z.string().min(1).max(200),
});

export const createMailboxSchema = z.object({
  localPart: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9._-]+$/i, 'Invalid local part'),
  domainId: z.string().cuid(),
  displayName: z.string().max(120).optional(),
});

export const outboundAttachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().max(127).optional(),
  // base64-encoded bytes; ~9.3MB base64 ≈ 7MB binary per attachment.
  contentBase64: z.string().max(9_800_000),
});

export const sendMessageSchema = z.object({
  // Any address on a domain the user controls (provisioned or not).
  from: emailSchema,
  fromName: z.string().max(100).optional(), // display name in the From header
  to: emailSchema,
  subject: z.string().max(255).optional(),
  text: z.string().max(100_000).optional(),
  html: z.string().max(500_000).optional(),
  attachments: z.array(outboundAttachmentSchema).max(10).optional(),
});

export const composeRecipientSchema = z.object({
  email: emailSchema,
  // Per-recipient merge variables (e.g. from a CSV import): {{name}} etc.
  vars: z.record(z.string(), z.string().max(2000)).optional(),
});

export const composeSchema = z.object({
  // A concrete email, OR one containing dynamic tokens (e.g. {{randmail}}@domain)
  // resolved server-side per message.
  from: z
    .string()
    .min(3)
    .max(255)
    .refine((v) => v.includes('{{') || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Invalid from address'),
  recipients: z.array(composeRecipientSchema).min(1).max(1000),
  // `subject` is a single subject; `subjects` is a pool rotated per recipient
  // according to `subjectMode` (sequential | random).
  subject: z.string().max(255).optional(),
  subjects: z.array(z.string().max(255)).max(500).optional(),
  subjectMode: z.enum(['single', 'sequential', 'random']).optional(),
  text: z.string().max(100_000).optional(),
  html: z.string().max(500_000).optional(),
  attachments: z.array(outboundAttachmentSchema).max(10).optional(),
  // ISO timestamp; when in the future the message is scheduled, else sent now.
  scheduleAt: z.string().datetime().optional(),
  // Sender display name. `fromName` is a single fixed name; `fromNames` is a pool
  // rotated per recipient according to `fromNameMode`.
  fromName: z.string().max(100).optional(),
  fromNames: z.array(z.string().max(100)).max(500).optional(),
  fromNameMode: z.enum(['single', 'sequential', 'random']).optional(),
  // Body / "letter" rotation. `format` says whether the rendered body is text or
  // HTML; `letters` is a pool rotated per recipient according to `letterMode`.
  format: z.enum(['text', 'html']).optional(),
  letters: z.array(z.string().max(500_000)).max(200).optional(),
  letterMode: z.enum(['single', 'sequential', 'random']).optional(),
  // Starting index for sequential rotation, so client-side throttled batches keep
  // a continuous rotation across multiple requests.
  indexOffset: z.number().int().min(0).max(1_000_000).optional(),
});

export type ComposeInput = z.infer<typeof composeSchema>;
export type ComposeRecipient = z.infer<typeof composeRecipientSchema>;

export const createDomainSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(253)
    .regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/i, 'Invalid domain name'),
  availability: z.enum(['FREE', 'ASSIGNED_USER', 'ASSIGNED_GROUP', 'DISABLED']).default('FREE'),
  dnsProvider: z
    .enum(['CLOUDFLARE_PLATFORM', 'CLOUDFLARE_DELEGATED', 'EXTERNAL_MANUAL'])
    .default('CLOUDFLARE_PLATFORM'),
});

export const addressPatternSchema = z.object({
  type: z.enum(['alphanumeric', 'numeric', 'letters', 'words']).default('alphanumeric'),
  length: z.number().int().min(4).max(32).optional(),
  wordCount: z.number().int().min(1).max(5).optional(),
  separator: z.string().max(3).optional(),
});

// Payload the inbound MTA (Haraka) posts to the web ingest endpoint after
// parsing a received message.
export const inboundAttachmentSchema = z.object({
  filename: z.string().max(255),
  contentType: z.string().max(127).optional(),
  sizeBytes: z.number().int().nonnegative().default(0),
  contentBase64: z.string().optional(), // omitted/streamed-to-storage in production
  isInline: z.boolean().default(false),
});

export const inboundMailSchema = z.object({
  from: emailSchema,
  to: z.string().max(254), // recipient as received (single envelope recipient)
  subject: z.string().max(998).optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  messageId: z.string().max(998).optional(),
  rawSizeBytes: z.number().int().nonnegative().default(0),
  rawRef: z.string().optional(), // object-storage key for the raw MIME
  attachments: z.array(inboundAttachmentSchema).default([]),
});

export type InboundMail = z.infer<typeof inboundMailSchema>;

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateMailboxInput = z.infer<typeof createMailboxSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateDomainInput = z.infer<typeof createDomainSchema>;
