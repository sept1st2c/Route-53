import { api } from "./api";
import type {
  User,
  HostedZone,
  DNSRecord,
  Paginated,
  ZoneCreateInput,
  RecordInput,
} from "@/types";

// ─── Auth ───────────────────────────────────────────────────────────────────
export const authService = {
  async login(email: string, password: string): Promise<string> {
    const { data } = await api.post("/auth/login", { email, password });
    return data.access_token as string;
  },
  async register(email: string, password: string, full_name: string): Promise<string> {
    const { data } = await api.post("/auth/register", { email, password, full_name });
    return data.access_token as string;
  },
  async logout(): Promise<void> {
    await api.post("/auth/logout");
  },
  async me(): Promise<User> {
    const { data } = await api.get<User>("/auth/me");
    return data;
  },
};

// ─── Hosted Zones ─────────────────────────────────────────────────────────────
export interface ZoneQuery {
  search?: string;
  type?: "" | "Public" | "Private";
  page?: number;
  limit?: number;
}

export const zoneService = {
  async list(q: ZoneQuery = {}): Promise<Paginated<HostedZone>> {
    const { data } = await api.get<Paginated<HostedZone>>("/zones", {
      params: {
        search: q.search || "",
        type: q.type || "",
        page: q.page || 1,
        limit: q.limit || 10,
      },
    });
    return data;
  },
  async get(id: number): Promise<HostedZone> {
    const { data } = await api.get<HostedZone>(`/zones/${id}`);
    return data;
  },
  async create(input: ZoneCreateInput): Promise<HostedZone> {
    const { data } = await api.post<HostedZone>("/zones", input);
    return data;
  },
  async update(id: number, input: Partial<ZoneCreateInput>): Promise<HostedZone> {
    const { data } = await api.put<HostedZone>(`/zones/${id}`, input);
    return data;
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/zones/${id}`);
  },
};

// ─── DNS Records ──────────────────────────────────────────────────────────────
export interface RecordQuery {
  search?: string;
  type?: string;
  page?: number;
  limit?: number;
}

export const recordService = {
  async list(zoneId: number, q: RecordQuery = {}): Promise<Paginated<DNSRecord>> {
    const { data } = await api.get<Paginated<DNSRecord>>(`/zones/${zoneId}/records`, {
      params: {
        search: q.search || "",
        type: q.type || "",
        page: q.page || 1,
        limit: q.limit || 10,
      },
    });
    return data;
  },
  async create(zoneId: number, input: RecordInput): Promise<DNSRecord> {
    const { data } = await api.post<DNSRecord>(`/zones/${zoneId}/records`, input);
    return data;
  },
  async update(zoneId: number, recordId: number, input: Partial<RecordInput>): Promise<DNSRecord> {
    const { data } = await api.put<DNSRecord>(`/zones/${zoneId}/records/${recordId}`, input);
    return data;
  },
  async remove(zoneId: number, recordId: number): Promise<void> {
    await api.delete(`/zones/${zoneId}/records/${recordId}`);
  },
  async bulkRemove(zoneId: number, ids: number[]): Promise<void> {
    await api.delete(`/zones/${zoneId}/records`, { params: { ids: ids.join(",") } });
  },
  async importZone(zoneId: number, zoneFile: string): Promise<ImportResult> {
    const { data } = await api.post<ImportResult>(`/zones/${zoneId}/records/import`, { zone_file: zoneFile });
    return data;
  },
};

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}
