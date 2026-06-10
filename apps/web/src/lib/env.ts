// Critical environment variables that must be set in production. Used by the
// health endpoint to surface misconfiguration during/after deploy.
const REQUIRED_PROD = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'ENCRYPTION_KEY',
  'MAIL_INGEST_SECRET',
  'NEXT_PUBLIC_SITE_URL',
] as const;

export function missingProdEnv(): string[] {
  if (process.env.NODE_ENV !== 'production') return [];
  return REQUIRED_PROD.filter((k) => !process.env[k] || process.env[k] === '');
}

// Secrets that ship with insecure dev defaults — must be changed for production.
const INSECURE_DEFAULTS: Record<string, string> = {
  AUTH_SECRET: 'dev_secret_change_me_0123456789abcdef0123456789abcdef',
  ENCRYPTION_KEY: 'dev_encryption_key_0123456789abcdef0123456789abcd',
  MAIL_INGEST_SECRET: 'dev_ingest_secret_change_me',
};

export function insecureProdSecrets(): string[] {
  if (process.env.NODE_ENV !== 'production') return [];
  return Object.entries(INSECURE_DEFAULTS)
    .filter(([k, v]) => process.env[k] === v)
    .map(([k]) => k);
}
