// API types — mirror the FastAPI backend (snake_case) exactly.

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  created_at: string;
}

export type ZoneType = "Public" | "Private";

export interface HostedZone {
  id: number;
  zone_id: string; // Route53-style, e.g. Z1D633PJN98FT9
  name: string;
  type: ZoneType;
  comment: string | null;
  record_count: number;
  created_at: string;
  updated_at: string | null;
}

// Route 53 record types a user can create, in console order (SOA is system-managed).
export const RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "PTR",
  "SRV",
  "SPF",
  "NAPTR",
  "CAA",
  "NS",
  "DS",
  "TLSA",
  "SSHFP",
  "HTTPS",
  "SVCB",
] as const;

export type RecordType = (typeof RECORD_TYPES)[number] | "SOA";

export interface DNSRecord {
  id: number;
  zone_id: number;
  name: string;
  type: RecordType;
  ttl: number | null;
  value: string; // newline-separated for multi-value records
  routing_policy: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ZoneCreateInput {
  name: string;
  type: ZoneType;
  comment?: string | null;
}

export interface RecordInput {
  name: string;
  type: RecordType;
  ttl?: number | null;
  value: string;
  routing_policy?: string | null;
  comment?: string | null;
}
