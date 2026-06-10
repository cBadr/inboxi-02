import { z } from 'zod';

// Shared validation schemas used by API routes and forms.

export const emailSchema = z.string().email().max(254);

export const signupSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120).optional(),
  referralCode: z.string().max(64).optional(),
  anonymousToken: z.string().max(200).optional(), // link an anonymous session on signup
});

export const loginSchema = z.object({
  email: emailSchema,
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

export const sendMessageSchema = z.object({
  // Any address on a domain the user controls (provisioned or not).
  from: emailSchema,
  to: emailSchema,
  subject: z.string().max(255).optional(),
  text: z.string().max(100_000).optional(),
  html: z.string().max(500_000).optional(),
});

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
