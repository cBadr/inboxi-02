import type { DnsRecord } from './records';

// Thin Cloudflare API v4 client. fetch is injectable for testing. Only the
// operations the platform needs: ensure a zone exists and upsert records.

const API_BASE = 'https://api.cloudflare.com/client/v4';

export interface CloudflareOptions {
  apiToken: string;
  accountId?: string;
  fetchImpl?: typeof fetch;
}

interface CfResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

export class CloudflareClient {
  private token: string;
  private accountId?: string;
  private f: typeof fetch;

  constructor(opts: CloudflareOptions) {
    this.token = opts.apiToken;
    this.accountId = opts.accountId;
    this.f = opts.fetchImpl ?? fetch;
  }

  private async call<T>(path: string, init?: RequestInit): Promise<CfResponse<T>> {
    const res = await this.f(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    return (await res.json()) as CfResponse<T>;
  }

  async findZone(name: string): Promise<{ id: string } | null> {
    const r = await this.call<Array<{ id: string; name: string }>>(
      `/zones?name=${encodeURIComponent(name)}`,
    );
    if (r.success && r.result.length > 0) return { id: r.result[0]!.id };
    return null;
  }

  async ensureZone(name: string): Promise<string> {
    const existing = await this.findZone(name);
    if (existing) return existing.id;
    const r = await this.call<{ id: string }>(`/zones`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        account: this.accountId ? { id: this.accountId } : undefined,
        jump_start: false,
      }),
    });
    if (!r.success) throw new Error(`Cloudflare zone create failed: ${r.errors?.[0]?.message}`);
    return r.result.id;
  }

  async upsertRecord(zoneId: string, record: DnsRecord): Promise<void> {
    const recordName = record.name === '@' ? '' : record.name;
    const existing = await this.call<Array<{ id: string; name: string; type: string }>>(
      `/zones/${zoneId}/dns_records?type=${record.type}`,
    );
    const fqdn = recordName ? `${recordName}` : '';
    const match = existing.success
      ? existing.result.find((r) => r.name.startsWith(fqdn) && r.type === record.type)
      : undefined;

    const body = JSON.stringify({
      type: record.type,
      name: record.name === '@' ? undefined : record.name,
      content: record.content,
      priority: record.priority,
      ttl: record.ttl ?? 1,
    });

    if (match) {
      await this.call(`/zones/${zoneId}/dns_records/${match.id}`, { method: 'PUT', body });
    } else {
      await this.call(`/zones/${zoneId}/dns_records`, { method: 'POST', body });
    }
  }

  async upsertRecords(zoneId: string, records: DnsRecord[]): Promise<void> {
    for (const r of records) await this.upsertRecord(zoneId, r);
  }

  // Generic record CRUD for the custom DNS manager.
  async listRecords(zoneId: string): Promise<CloudflareRecord[]> {
    const r = await this.call<CloudflareRecord[]>(`/zones/${zoneId}/dns_records?per_page=200`);
    return r.success ? r.result : [];
  }

  async createRecord(zoneId: string, record: DnsRecord): Promise<void> {
    await this.call(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({
        type: record.type,
        name: record.name === '@' ? undefined : record.name,
        content: record.content,
        priority: record.priority,
        ttl: record.ttl ?? 1,
        proxied: false,
      }),
    });
  }

  async deleteRecord(zoneId: string, recordId: string): Promise<void> {
    await this.call(`/zones/${zoneId}/dns_records/${recordId}`, { method: 'DELETE' });
  }
}

export interface CloudflareRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  priority?: number;
  ttl: number;
  proxied?: boolean;
}
