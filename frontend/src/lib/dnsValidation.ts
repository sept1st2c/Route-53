// Per-record-type rules transcribed from the Route 53 developer guide so the console clone
// rejects exactly what the real service rejects:
//   ResourceRecordTypes.html            – rdata format for every supported type
//   resource-record-sets-values-shared  – Value/Route traffic to + TTL semantics
//   DomainNameFormat.html               – label/name length, character set, escape codes, wildcards
//   APIReference/API_ResourceRecordSet  – TTL valid range (0–2147483647), Name max length 1024

import type { RecordType } from "@/types";

export const TTL_MIN = 0;
export const TTL_MAX = 2147483647;

/** Shown under the TTL input, verbatim from the console. */
export const TTL_CONSTRAINT_TEXT = "Recommended values: 60 to 172800 (two days)";

/** The console's quick-set chips next to the TTL input. */
export const TTL_PRESETS: { label: string; seconds: number }[] = [
  { label: "1m", seconds: 60 },
  { label: "1h", seconds: 3600 },
  { label: "1d", seconds: 86400 },
];

/** AWS calls the Value textarea "Endpoints" in its validation copy. */
export const VALUE_REQUIRED_ERROR = "Endpoints field is required to have value.";
export const REGION_REQUIRED_ERROR = "Region is required to have value.";
export const ENDPOINT_REQUIRED_ERROR = "Endpoint is required to have value.";
export const TTL_REQUIRED_ERROR = "TTL is required to have value.";

export type RecordTypeOption = {
  value: RecordType;
  /** Single-line option text as the console renders it (note: A–NS use an en dash, DS onwards a hyphen). */
  label: string;
  /** Example value the console shows as the textarea placeholder. */
  placeholder: string;
};

export const RECORD_TYPE_OPTIONS: RecordTypeOption[] = [
  {
    value: "A",
    label: "A – Routes traffic to an IPv4 address and some AWS resources",
    placeholder: "192.0.2.235",
  },
  {
    value: "AAAA",
    label: "AAAA – Routes traffic to an IPv6 address and some AWS resources",
    placeholder: "2001:0db8:85a3:0:0:8a2e:0370:7334",
  },
  {
    value: "CNAME",
    label: "CNAME – Routes traffic to another domain name and to some AWS resources",
    placeholder: "hostname.example.com",
  },
  { value: "MX", label: "MX – Specifies mail servers", placeholder: "10 mail.example.com" },
  {
    value: "TXT",
    label: "TXT – Used to verify email senders and for application-specific values",
    placeholder: '"v=spf1 ip4:192.168.0.1/16 -all"',
  },
  { value: "PTR", label: "PTR – Maps an IP address to a domain name", placeholder: "hostname.example.com" },
  {
    value: "SRV",
    label: "SRV – Application-specific values that identify servers",
    placeholder: "10 5 80 hostname.example.com",
  },
  { value: "SPF", label: "SPF – Not recommended", placeholder: '"v=spf1 ip4:192.168.0.1/16 -all"' },
  {
    value: "NAPTR",
    label: "NAPTR – Used by DDDS applications",
    placeholder: '100 50 "u" "E2U+sip" "!^.*$!sip:info@example.com!" .',
  },
  {
    value: "CAA",
    label: "CAA – Restricts CAs that can create SSL/TLS certificates for the domain",
    placeholder: '0 issue "ca.example.net"',
  },
  { value: "NS", label: "NS – Name servers for a hosted zone", placeholder: "ns-1.example.com" },
  {
    value: "DS",
    label: "DS - Delegation Signer, used to establish a chain of trust for DNSSEC",
    placeholder: "123 4 5 1234567890abcdef1234567890abcdef",
  },
  {
    value: "TLSA",
    label: "TLSA - Associates a TLS server certificate or public key with the domain name. DNSSEC required.",
    placeholder: "0 0 1 d2abde240d7cd3ee6b4b28c54df034b97983a1d16e8a410e4561cb106618e971",
  },
  {
    value: "SSHFP",
    label: "SSHFP - Specifies the SSH key fingerprint and algorithm. DNSSEC required.",
    placeholder: "1 1 09F6A01D2175742B257C6B98B7C72C44C4040683",
  },
  {
    value: "HTTPS",
    label:
      "HTTPS - Provides connection optimization details like protocols, ports, and endpoints for efficient client-service communication.",
    placeholder: '16 example.com alpn="h2,h3" port=808',
  },
  {
    value: "SVCB",
    label: "SVCB - Delivers extensible configuration information for accessing service endpoints.",
    placeholder: '16 example.com alpn="h2,h3" port=808',
  },
];

/** Routing policies in the order the console lists them. */
export const ROUTING_POLICY_OPTIONS: { value: string; label: string }[] = [
  { value: "Simple", label: "Simple routing" },
  { value: "Weighted", label: "Weighted" },
  { value: "Geolocation", label: "Geolocation" },
  { value: "Latency", label: "Latency" },
  { value: "Failover", label: "Failover" },
  { value: "Multivalue answer", label: "Multivalue answer" },
  { value: "IP-based", label: "IP-based" },
  { value: "Geoproximity", label: "Geoproximity" },
];

export function recordTypeOption(type: RecordType): RecordTypeOption | undefined {
  return RECORD_TYPE_OPTIONS.find((o) => o.value === type);
}

// ─── primitives ───────────────────────────────────────────────────────────────

export function isIPv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

export function isIPv6(value: string): boolean {
  if (!/^[0-9A-Fa-f:.]+$/.test(value)) return false;
  const halves = value.split("::");
  if (halves.length > 2) return false;
  // A trailing dotted quad is only legal as the very last group.
  if (halves.length === 2 && halves[0].includes(".")) return false;

  const groups = (chunk: string): number | null => {
    if (chunk === "") return 0;
    const parts = chunk.split(":");
    let count = 0;
    for (let i = 0; i < parts.length; i++) {
      const g = parts[i];
      if (g.includes(".")) {
        // An embedded IPv4 address occupies the final two 16-bit groups.
        if (i !== parts.length - 1 || !isIPv4(g)) return null;
        count += 2;
        continue;
      }
      if (!/^[0-9A-Fa-f]{1,4}$/.test(g)) return null;
      count += 1;
    }
    return count;
  };

  const head = groups(halves[0]);
  if (head === null) return false;
  if (halves.length === 1) return head === 8;
  const tail = groups(halves[1]);
  if (tail === null) return false;
  // "::" has to stand in for at least one zero group.
  return head + tail <= 7;
}

/** Characters Route 53 accepts in a label, plus \DDD octal escapes for everything else. */
const LABEL_RE = /^(?:[A-Za-z0-9_!"#$%&'()*+,\-/:;<=>?@[\]^`{|}~]|\\[0-7]{3})+$/;

export type DnsNameOptions = { wildcard?: boolean };

/** Validates a domain name used as rdata (CNAME/NS/PTR target, MX/SRV host, …). */
export function isDnsName(value: string, opts: DnsNameOptions = {}): boolean {
  const name = value.endsWith(".") ? value.slice(0, -1) : value;
  if (name === "" || name.length > 255) return false;
  const labels = name.split(".");
  return labels.every((label, i) => {
    if (label === "*") return !!opts.wildcard && i === 0;
    if (label === "" || label.length > 63) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
    return LABEL_RE.test(label);
  });
}

function intInRange(token: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(token)) return false;
  const n = Number(token);
  return n >= min && n <= max;
}

const isHex = (s: string) => s.length > 0 && /^[0-9A-Fa-f]+$/.test(s);

/** Splits on whitespace but keeps `"quoted tokens"` (including their quotes) intact. */
function tokenize(line: string): string[] | null {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    if (line[i] === '"') {
      let token = '"';
      let closed = false;
      i++;
      while (i < line.length) {
        if (line[i] === "\\" && i + 1 < line.length) {
          token += line.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (line[i] === '"') {
          token += '"';
          i++;
          closed = true;
          break;
        }
        token += line[i];
        i++;
      }
      if (!closed) return null;
      tokens.push(token);
    } else {
      let token = "";
      while (i < line.length && !/\s/.test(line[i])) {
        token += line[i];
        i++;
      }
      tokens.push(token);
    }
  }
  return tokens;
}

const isQuoted = (t: string) => t.length >= 2 && t.startsWith('"') && t.endsWith('"');

const UNMATCHED_QUOTE = "The value contains an unmatched double quotation mark.";

/** TXT/SPF values are a whitespace-separated run of quoted strings, each at most 255 characters. */
function validateQuotedStrings(line: string): string | null {
  if (line.length > 4000) return "A text value can have up to 4000 characters.";
  const tokens = tokenize(line);
  if (tokens === null) return UNMATCHED_QUOTE;
  if (tokens.length === 0 || tokens.some((t) => !isQuoted(t))) {
    return 'Enclose each string in double quotation marks, for example "v=spf1 ip4:192.168.0.1/16 -all".';
  }
  if (tokens.some((t) => t.length - 2 > 255)) {
    return "A single string can have up to 255 characters. Break longer values into several quoted strings on the same line.";
  }
  return null;
}

const SVC_PARAM_KEYS = ["alpn", "no-default-alpn", "port", "ipv4hint", "ech", "ipv6hint", "dohpath", "ohttp"];

/** HTTPS/SVCB share the `SvcPriority TargetName SvcParams` presentation format of RFC 9460. */
function validateSvcb(line: string): string | null {
  const tokens = tokenize(line);
  if (tokens === null) return UNMATCHED_QUOTE;
  if (tokens.length < 2) return "Enter a priority and a target name, for example 16 example.com.";
  if (!intInRange(tokens[0], 0, 32767)) return "The priority must be an integer between 0 and 32767.";
  if (tokens[1] !== "." && !isDnsName(tokens[1])) return "The target name is not a valid domain name.";

  for (const param of tokens.slice(2)) {
    const eq = param.indexOf("=");
    const key = eq === -1 ? param : param.slice(0, eq);
    const raw = eq === -1 ? "" : param.slice(eq + 1);
    const value = isQuoted(raw) ? raw.slice(1, -1) : raw;
    if (/^key\d+$/.test(key)) return `Route 53 does not support the unknown-key format ${key}.`;
    if (!SVC_PARAM_KEYS.includes(key)) {
      return `${key} is not a supported service parameter. Supported keys: ${SVC_PARAM_KEYS.join(", ")}.`;
    }
    if (key === "port" && !intInRange(value, 0, 65535)) return "port must be an integer between 0 and 65535.";
    if (key === "ipv4hint" && !value.split(",").every(isIPv4)) return "ipv4hint must be a comma-separated list of IPv4 addresses.";
    if (key === "ipv6hint" && !value.split(",").every(isIPv6)) return "ipv6hint must be a comma-separated list of IPv6 addresses.";
    if (key === "alpn" && value === "") return "alpn must list at least one protocol ID, for example alpn=\"h2,h3\".";
  }
  return null;
}

// ─── per-type rdata ───────────────────────────────────────────────────────────

function validateLine(type: RecordType, line: string): string | null {
  switch (type) {
    case "A":
      return isIPv4(line) ? null : "Enter a valid IPv4 address, for example 192.0.2.235.";

    case "AAAA":
      return isIPv6(line) ? null : "Enter a valid IPv6 address, for example 2001:0db8:85a3:0:0:8a2e:0370:7334.";

    case "CNAME":
    case "PTR":
      return isDnsName(line) ? null : "Enter a valid domain name, for example hostname.example.com.";

    case "NS":
      // The console forbids the wildcard for NS, so no wildcard in the target either.
      return isDnsName(line) ? null : "Enter the domain name of a name server, for example ns-1.example.com.";

    case "MX": {
      const tokens = line.split(/\s+/);
      if (tokens.length !== 2) return "Enter a priority and a domain name, for example 10 mail.example.com.";
      if (!intInRange(tokens[0], 0, 65535)) return "The priority must be an integer between 0 and 65535.";
      return isDnsName(tokens[1]) ? null : "The mail server is not a valid domain name.";
    }

    case "TXT":
    case "SPF":
      return validateQuotedStrings(line);

    case "SRV": {
      const tokens = line.split(/\s+/);
      if (tokens.length !== 4) return "Enter priority, weight, port and target, for example 10 5 80 hostname.example.com.";
      if (!intInRange(tokens[0], 0, 65535)) return "The priority must be an integer between 0 and 65535.";
      if (!intInRange(tokens[1], 0, 65535)) return "The weight must be an integer between 0 and 65535.";
      if (!intInRange(tokens[2], 0, 65535)) return "The port must be an integer between 0 and 65535.";
      return isDnsName(tokens[3]) ? null : "The target is not a valid domain name.";
    }

    case "NAPTR": {
      const tokens = tokenize(line);
      if (tokens === null) return UNMATCHED_QUOTE;
      if (tokens.length !== 6) {
        return 'Enter order, preference, flags, service, regexp and replacement, for example 100 50 "u" "E2U+sip" "!^.*$!sip:info@example.com!" .';
      }
      if (!intInRange(tokens[0], 0, 65535)) return "The order must be an integer between 0 and 65535.";
      if (!intInRange(tokens[1], 0, 65535)) return "The preference must be an integer between 0 and 65535.";
      if (!isQuoted(tokens[2])) return "Enclose flags in quotation marks, for example \"u\".";
      if (!/^"[APSUapsu]?"$/.test(tokens[2])) return 'Valid flags are "A", "P", "S", "U" or the empty string "".';
      if (!isQuoted(tokens[3])) return 'Enclose service in quotation marks, for example "E2U+sip".';
      if (!isQuoted(tokens[4])) return "Enclose regexp in quotation marks, or specify \"\" and use replacement instead.";
      if (tokens[5] !== "." && !isDnsName(tokens[5])) {
        return "Replacement must be a fully qualified domain name, or a dot (.) when regexp is used.";
      }
      return null;
    }

    case "CAA": {
      const tokens = tokenize(line);
      if (tokens === null) return UNMATCHED_QUOTE;
      if (tokens.length !== 3) return 'Enter flags, tag and value, for example 0 issue "ca.example.net".';
      if (!intInRange(tokens[0], 0, 255)) return "Flags must be an integer between 0 and 255.";
      if (!/^[A-Za-z0-9]+$/.test(tokens[1])) return "The tag can contain only the characters A-Z, a-z and 0-9.";
      return isQuoted(tokens[2]) ? null : 'Enclose the value in quotation marks, for example "ca.example.net".';
    }

    case "DS": {
      const tokens = line.split(/\s+/);
      if (tokens.length < 4) return "Enter key tag, algorithm, digest type and digest, for example 123 4 5 1234567890abcdef.";
      if (!intInRange(tokens[0], 0, 65535)) return "The key tag must be an integer between 0 and 65535.";
      if (!intInRange(tokens[1], 0, 255)) return "The algorithm must be an integer between 0 and 255.";
      if (!intInRange(tokens[2], 0, 255)) return "The digest type must be an integer between 0 and 255.";
      return isHex(tokens.slice(3).join("")) ? null : "The digest must be a hexadecimal value.";
    }

    case "TLSA": {
      const tokens = line.split(/\s+/);
      if (tokens.length < 4) {
        return "Enter certificate usage, selector, matching type and certificate association data, for example 0 0 1 d2abde24…";
      }
      if (!intInRange(tokens[0], 0, 3)) return "Certificate usage must be 0, 1, 2 or 3.";
      if (!intInRange(tokens[1], 0, 1)) return "Selector must be 0 or 1.";
      if (!intInRange(tokens[2], 0, 2)) return "Matching type must be 0, 1 or 2.";
      return isHex(tokens.slice(3).join("")) ? null : "The certificate association data must be a hexadecimal value.";
    }

    case "SSHFP": {
      const tokens = line.split(/\s+/);
      if (tokens.length < 3) return "Enter key algorithm, hash type and fingerprint, for example 1 1 09F6A01D2175742B…";
      if (!["1", "2", "3", "4", "6"].includes(tokens[0])) {
        return "Key algorithm must be 1 (RSA), 2 (DSA), 3 (ECDSA), 4 (Ed25519) or 6 (Ed448).";
      }
      if (!["1", "2"].includes(tokens[1])) return "Hash type must be 1 (SHA-1) or 2 (SHA-256).";
      return isHex(tokens.slice(2).join("")) ? null : "The fingerprint must be a hexadecimal value.";
    }

    case "HTTPS":
    case "SVCB":
      return validateSvcb(line);

    case "SOA": {
      const tokens = line.split(/\s+/);
      if (tokens.length !== 7) {
        return "Enter a primary name server, responsible party and five integers, for example ns-2048.awsdns-64.net hostmaster.awsdns.com 1 1 1 1 60.";
      }
      if (!isDnsName(tokens[0])) return "The primary name server is not a valid domain name.";
      if (!isDnsName(tokens[1])) return "The responsible party is not a valid domain name.";
      return tokens.slice(2).every((t) => /^\d+$/.test(t))
        ? null
        : "Serial, refresh, retry, expire and minimum TTL must be integers.";
    }

    default:
      return null;
  }
}

/**
 * Validates the Value textarea. Every non-blank line is checked, and the offending line number
 * is prefixed when the record holds more than one value.
 */
export function validateRecordValue(type: RecordType, value: string): string | null {
  if (!value.trim()) return VALUE_REQUIRED_ERROR;
  const lines = value.split("\n");
  const filled = lines.map((l, i) => ({ text: l.trim(), n: i + 1 })).filter((l) => l.text !== "");

  // The DNS protocol allows a single canonical name only.
  if (type === "CNAME" && filled.length > 1) return "A CNAME record can have only one value.";

  for (const line of filled) {
    const error = validateLine(type, line.text);
    if (error) return filled.length > 1 ? `Line ${line.n}: ${error}` : error;
  }
  return null;
}

/** Validates the subdomain typed into Record name, which Route 53 prefixes to the hosted zone name. */
export function validateRecordName(sub: string, zoneName: string, type: RecordType): string | null {
  const zone = zoneName.replace(/\.$/, "");
  const label = sub.trim().replace(/\.$/, "");

  if (label === "") {
    // The apex can't hold a CNAME — DNS reserves it for the zone's own NS/SOA records.
    return type === "CNAME" ? "You can't create a CNAME record with the same name as the hosted zone." : null;
  }
  if (`${label}.${zone}`.length > 255) {
    return "A record name can have up to 255 characters, including the hosted zone name.";
  }

  const labels = label.split(".");
  for (let i = 0; i < labels.length; i++) {
    const part = labels[i];
    if (part === "*") {
      if (type === "NS") return "You can't use the * wildcard in the name of an NS record.";
      if (i !== 0) return "The * wildcard must replace the leftmost label, for example *.example.com.";
      continue;
    }
    if (part === "") return "The record name contains an empty label.";
    if (part.length > 63) return "Each label in a record name can have up to 63 characters.";
    if (part.includes("*")) return "The * wildcard must replace an entire label, for example *.example.com.";
    if (!LABEL_RE.test(part)) {
      return "Valid characters: a-z, 0-9, ! \" # $ % & ' ( ) * + , - / : ; < = > ? @ [ \\ ] ^ _ ` { | } . ~";
    }
  }
  return null;
}

export function validateTtl(ttl: string): string | null {
  const raw = ttl.trim();
  if (raw === "") return TTL_REQUIRED_ERROR;
  if (!/^\d+$/.test(raw)) return `TTL must be a whole number between ${TTL_MIN} and ${TTL_MAX}.`;
  const n = Number(raw);
  if (n < TTL_MIN || n > TTL_MAX) return `TTL must be a whole number between ${TTL_MIN} and ${TTL_MAX}.`;
  return null;
}
