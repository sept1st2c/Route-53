/**
 * Single source of truth for Route 53 routing policies.
 *
 * The full list and its order come from the console's Routing policy dropdown
 * (see `frontend/uiss/createrecord_3.png`) and
 * https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy.html
 *
 * Only "Simple routing" is actually supported end to end. Every other policy
 * additionally requires per-policy fields that this clone has no storage for —
 * Weighted needs Weight + a Record ID (SetIdentifier), Failover needs a
 * primary/secondary role, Latency and Geoproximity need a Region, Geolocation
 * needs a continent/country, IP-based needs a CIDR collection — so selecting one
 * would record a policy name while silently dropping what makes it meaningful.
 * They are therefore listed (for fidelity with the console) but disabled and
 * labelled, rather than accepted and quietly discarded.
 */
export type RoutingPolicy =
  | "Simple"
  | "Weighted"
  | "Geolocation"
  | "Latency"
  | "Failover"
  | "Multivalue answer"
  | "IP-based"
  | "Geoproximity";

export interface RoutingPolicyOption {
  /** Stored value, i.e. `DNSRecord.routing_policy`. */
  value: RoutingPolicy;
  /** Console label. "Simple" is shown as "Simple routing". */
  label: string;
  /** Why it can't be chosen yet, shown as the option description. */
  description?: string;
  supported: boolean;
}

const UNSUPPORTED = "Coming soon — needs routing-policy fields this clone doesn't store yet";

export const ROUTING_POLICY_OPTIONS: readonly RoutingPolicyOption[] = [
  { value: "Simple", label: "Simple routing", supported: true },
  { value: "Weighted", label: "Weighted", description: UNSUPPORTED, supported: false },
  { value: "Geolocation", label: "Geolocation", description: UNSUPPORTED, supported: false },
  { value: "Latency", label: "Latency", description: UNSUPPORTED, supported: false },
  { value: "Failover", label: "Failover", description: UNSUPPORTED, supported: false },
  { value: "Multivalue answer", label: "Multivalue answer", description: UNSUPPORTED, supported: false },
  { value: "IP-based", label: "IP-based", description: UNSUPPORTED, supported: false },
  { value: "Geoproximity", label: "Geoproximity", description: UNSUPPORTED, supported: false },
] as const;

/** Policy names that may appear on stored records, for filter dropdowns. */
export const ROUTING_POLICY_VALUES = ROUTING_POLICY_OPTIONS.map((p) => p.value);
