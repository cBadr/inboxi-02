import { prisma, type PaymentProviderType } from '@inboxi/db';

export interface GatewayInfo {
  provider: PaymentProviderType;
  label: string;
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

// Whether live API credentials exist for a gateway (else dev/simulate flow).
export function gatewayConfigured(p: PaymentProviderType): boolean {
  if (p === 'NOWPAYMENTS') return Boolean(process.env.NOWPAYMENTS_API_KEY);
  if (p === 'COINPAYMENTS') return Boolean(process.env.COINPAYMENTS_PUBLIC_KEY);
  return Boolean(process.env.BINANCE_PAY_API_KEY);
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
