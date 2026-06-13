import { prisma, type PaymentProviderType } from '@inboxi/db';
import { encryptSecret, decryptSecret } from './crypto';

export interface GatewayInfo {
  provider: PaymentProviderType;
  label: string;
}

// Credential fields each gateway needs. `secret` fields are masked in the UI and
// stored encrypted; `env` is the fallback environment variable.
export interface CredField {
  key: string;
  label: string;
  env: string;
  secret?: boolean;
}
export const CREDENTIAL_FIELDS: Record<PaymentProviderType, CredField[]> = {
  NOWPAYMENTS: [
    { key: 'apiKey', label: 'API key', env: 'NOWPAYMENTS_API_KEY', secret: true },
    { key: 'publicKey', label: 'Public key (optional)', env: 'NOWPAYMENTS_PUBLIC_KEY', secret: true },
    { key: 'ipnSecret', label: 'IPN secret', env: 'NOWPAYMENTS_IPN_SECRET', secret: true },
  ],
  COINPAYMENTS: [
    { key: 'publicKey', label: 'Public key', env: 'COINPAYMENTS_PUBLIC_KEY', secret: true },
    { key: 'privateKey', label: 'Private key', env: 'COINPAYMENTS_PRIVATE_KEY', secret: true },
    { key: 'merchantId', label: 'Merchant ID', env: 'COINPAYMENTS_MERCHANT_ID' },
    { key: 'ipnSecret', label: 'IPN secret', env: 'COINPAYMENTS_IPN_SECRET', secret: true },
  ],
  BINANCE_PAY: [
    { key: 'apiKey', label: 'API key', env: 'BINANCE_PAY_API_KEY', secret: true },
    { key: 'apiSecret', label: 'API secret', env: 'BINANCE_PAY_API_SECRET', secret: true },
  ],
};

// The field that, when present, lets us attempt a live checkout for a gateway.
const PRIMARY_FIELD: Record<PaymentProviderType, string> = {
  NOWPAYMENTS: 'apiKey',
  COINPAYMENTS: 'publicKey',
  BINANCE_PAY: 'apiKey',
};

type StoredCreds = Partial<Record<PaymentProviderType, Record<string, string>>>;

async function getStoredCreds(): Promise<StoredCreds> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: 'payments.credentials' } });
    return (row?.value as StoredCreds) ?? {};
  } catch {
    return {};
  }
}

function tryDecrypt(v: string | undefined): string | undefined {
  if (!v) return undefined;
  try {
    return decryptSecret(v);
  } catch {
    return undefined;
  }
}

// Resolve a gateway's credentials: DB-stored (decrypted) values win, falling back
// to the matching environment variable per field.
export async function getGatewayCredentials(
  provider: PaymentProviderType,
): Promise<Record<string, string | undefined>> {
  const stored = (await getStoredCreds())[provider] ?? {};
  const out: Record<string, string | undefined> = {};
  for (const f of CREDENTIAL_FIELDS[provider]) {
    out[f.key] = tryDecrypt(stored[f.key]) ?? process.env[f.env] ?? undefined;
  }
  return out;
}

// Save credentials for a gateway. Empty submitted fields are left unchanged so
// the admin never has to re-type existing secrets.
export async function saveGatewayCredentials(
  provider: PaymentProviderType,
  fields: Record<string, string>,
): Promise<void> {
  const all = await getStoredCreds();
  const current = { ...(all[provider] ?? {}) };
  for (const f of CREDENTIAL_FIELDS[provider]) {
    const v = (fields[f.key] ?? '').trim();
    if (v) current[f.key] = encryptSecret(v);
  }
  all[provider] = current;
  await prisma.setting.upsert({
    where: { key: 'payments.credentials' },
    update: { value: all as object },
    create: { key: 'payments.credentials', value: all as object, category: 'payments' },
  });
}

// Which credential fields are set (DB or env) — for the admin status display,
// without revealing the values.
export async function credentialStatus(
  provider: PaymentProviderType,
): Promise<Record<string, boolean>> {
  const creds = await getGatewayCredentials(provider);
  const out: Record<string, boolean> = {};
  for (const f of CREDENTIAL_FIELDS[provider]) out[f.key] = Boolean(creds[f.key]);
  return out;
}

// All gateways the platform can offer, in display order.
export const GATEWAYS: GatewayInfo[] = [
  { provider: 'NOWPAYMENTS', label: 'NOWPayments' },
  { provider: 'COINPAYMENTS', label: 'CoinPayments' },
  { provider: 'BINANCE_PAY', label: 'Binance Pay' },
];

export interface GatewayConfig {
  enabled: Record<PaymentProviderType, boolean>;
  default: PaymentProviderType;
}

const DEFAULT_CONFIG: GatewayConfig = {
  enabled: { NOWPAYMENTS: true, COINPAYMENTS: false, BINANCE_PAY: false },
  default: 'NOWPAYMENTS',
};

export async function getGatewayConfig(): Promise<GatewayConfig> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: 'payments.gateways' } });
    if (row?.value) {
      const v = row.value as Partial<GatewayConfig>;
      return {
        enabled: { ...DEFAULT_CONFIG.enabled, ...(v.enabled ?? {}) },
        default: v.default ?? DEFAULT_CONFIG.default,
      };
    }
  } catch {
    /* fall through */
  }
  return DEFAULT_CONFIG;
}

export async function saveGatewayConfig(cfg: GatewayConfig): Promise<void> {
  await prisma.setting.upsert({
    where: { key: 'payments.gateways' },
    update: { value: cfg as object },
    create: { key: 'payments.gateways', value: cfg as object, category: 'payments' },
  });
}

// Whether live API credentials exist for a gateway (DB or env) — else the
// dev/simulate flow is used at checkout.
export async function isGatewayConfigured(p: PaymentProviderType): Promise<boolean> {
  const creds = await getGatewayCredentials(p);
  return Boolean(creds[PRIMARY_FIELD[p]]);
}

// Gateways currently offered to buyers (enabled in admin), default first.
export async function enabledGateways(): Promise<GatewayInfo[]> {
  const cfg = await getGatewayConfig();
  const list = GATEWAYS.filter((g) => cfg.enabled[g.provider]);
  list.sort((a, b) => (a.provider === cfg.default ? -1 : b.provider === cfg.default ? 1 : 0));
  return list;
}

export async function isGatewayEnabled(p: PaymentProviderType): Promise<boolean> {
  const cfg = await getGatewayConfig();
  return Boolean(cfg.enabled[p]);
}
