import re
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from typing import Optional, List
from datetime import datetime


# ─── AUTH ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None

    @field_validator("email")
    @classmethod
    def email_looks_valid(cls, v: str) -> str:
        v = v.strip()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Enter a valid email address")
        return v

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── HOSTED ZONES ─────────────────────────────────────────────────────────────

class ZoneCreate(BaseModel):
    name: str
    type: str = "Public"
    comment: Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_must_end_with_dot(cls, v: str) -> str:
        v = v.strip()
        if not v.endswith("."):
            v += "."
        return v

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in ("Public", "Private"):
            raise ValueError("type must be Public or Private")
        return v


class ZoneUpdate(BaseModel):
    comment: Optional[str] = None
    type: Optional[str] = None


class ZoneOut(BaseModel):
    id: int
    zone_id: str
    name: str
    type: str
    comment: Optional[str] = None
    record_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_count(cls, zone):
        return cls(
            id=zone.id,
            zone_id=zone.zone_id,
            name=zone.name,
            type=zone.type,
            comment=zone.comment,
            record_count=len(zone.records),
            created_at=zone.created_at,
            updated_at=zone.updated_at,
        )


class ZoneListResponse(BaseModel):
    items: List[ZoneOut]
    total: int
    page: int
    limit: int
    pages: int


# ─── DNS RECORDS ──────────────────────────────────────────────────────────────

VALID_RECORD_TYPES = {
    "A", "AAAA", "CNAME", "MX", "TXT", "PTR", "SRV", "SPF",
    "NAPTR", "CAA", "NS", "DS", "TLSA", "SSHFP", "HTTPS", "SVCB",
}

# The rules below mirror frontend/src/lib/dnsValidation.ts so the API never accepts a
# record the console form would reject. Both sides are derived from:
#   APIReference/API_ResourceRecordSet  – TTL range, Name length, Type enum, NS wildcard ban
#   DeveloperGuide/DomainNameFormat     – label/name byte limits, legal characters, \DDD escapes
#   DeveloperGuide/ResourceRecordTypes  – per-type rdata format and field ranges

TTL_MIN = 0
TTL_MAX = 2147483647

MAX_LABEL_BYTES = 63
MAX_NAME_BYTES = 255

MAX_TXT_STRING_CHARS = 255
MAX_TXT_VALUE_CHARS = 4000

# Console dropdown order; see frontend/src/lib/routingPolicies.ts. Only "Simple" is wired
# end to end, but all eight are accepted so the stored value can round-trip.
ROUTING_POLICIES = (
    "Simple", "Weighted", "Geolocation", "Latency",
    "Failover", "Multivalue answer", "IP-based", "Geoproximity",
)

# AWS words the empty-value error this way, and the UI shows it verbatim.
VALUE_REQUIRED_ERROR = "Endpoints field is required to have value."
UNMATCHED_QUOTE_ERROR = "The value contains an unmatched double quotation mark."
LEGAL_CHARS_ERROR = (
    "Valid characters: a-z, 0-9, ! \" # $ % & ' ( ) * + , - / : ; < = > ? @ [ \\ ] ^ _ ` { | } . ~"
)

# Printable ASCII that DomainNameFormat allows in a label. A bare backslash is not in the
# set: it is only legal as the lead-in of a \DDD octal escape.
_LABEL_CHARS = r"""A-Za-z0-9_!"#$%&'()*+,\-/:;<=>?@\[\]^`{|}~"""
_LABEL_RE = re.compile(r"^(?:[" + _LABEL_CHARS + r"]|\\[0-7]{3})+$")


def _is_ipv4(value: str) -> bool:
    parts = value.split(".")
    if len(parts) != 4:
        return False
    return all(re.fullmatch(r"[0-9]{1,3}", p) and int(p) <= 255 for p in parts)


def _ipv6_group_count(chunk: str) -> Optional[int]:
    """Number of 16-bit groups in one side of a `::`, or None if the chunk is malformed."""
    if chunk == "":
        return 0
    parts = chunk.split(":")
    count = 0
    for i, group in enumerate(parts):
        if "." in group:
            # An embedded IPv4 address occupies the final two 16-bit groups.
            if i != len(parts) - 1 or not _is_ipv4(group):
                return None
            count += 2
            continue
        if not re.fullmatch(r"[0-9A-Fa-f]{1,4}", group):
            return None
        count += 1
    return count


def _is_ipv6(value: str) -> bool:
    if not re.fullmatch(r"[0-9A-Fa-f:.]+", value):
        return False
    halves = value.split("::")
    if len(halves) > 2:
        return False
    # A trailing dotted quad is only legal as the very last group.
    if len(halves) == 2 and "." in halves[0]:
        return False

    head = _ipv6_group_count(halves[0])
    if head is None:
        return False
    if len(halves) == 1:
        return head == 8
    tail = _ipv6_group_count(halves[1])
    if tail is None:
        return False
    # "::" has to stand in for at least one zero group.
    return head + tail <= 7


def _is_dns_name(value: str, wildcard: bool = False) -> bool:
    """Validates a domain name used as rdata (CNAME/NS/PTR target, MX/SRV host, ...)."""
    name = value[:-1] if value.endswith(".") else value
    if name == "" or len(name.encode("utf-8")) > MAX_NAME_BYTES:
        return False
    for i, label in enumerate(name.split(".")):
        if label == "*":
            if not (wildcard and i == 0):
                return False
            continue
        if label == "" or len(label.encode("utf-8")) > MAX_LABEL_BYTES:
            return False
        if label.startswith("-") or label.endswith("-"):
            return False
        if not _LABEL_RE.match(label):
            return False
    return True


def _int_in_range(token: str, low: int, high: int) -> bool:
    return bool(re.fullmatch(r"[0-9]+", token)) and low <= int(token) <= high


def _is_hex(value: str) -> bool:
    return bool(value) and bool(re.fullmatch(r"[0-9A-Fa-f]+", value))


def _tokenize(line: str) -> Optional[List[str]]:
    """Splits on whitespace but keeps `"quoted tokens"` (including their quotes) intact.

    Returns None when a quote is left open, which callers report as a distinct error.
    """
    tokens: List[str] = []
    i, n = 0, len(line)
    while i < n:
        while i < n and line[i].isspace():
            i += 1
        if i >= n:
            break
        if line[i] == '"':
            token, closed = '"', False
            i += 1
            while i < n:
                if line[i] == "\\" and i + 1 < n:
                    token += line[i:i + 2]
                    i += 2
                    continue
                if line[i] == '"':
                    token += '"'
                    i += 1
                    closed = True
                    break
                token += line[i]
                i += 1
            if not closed:
                return None
            tokens.append(token)
        else:
            start = i
            while i < n and not line[i].isspace():
                i += 1
            tokens.append(line[start:i])
    return tokens


def _is_quoted(token: str) -> bool:
    return len(token) >= 2 and token.startswith('"') and token.endswith('"')


def _validate_quoted_strings(line: str) -> Optional[str]:
    """TXT/SPF: a whitespace-separated run of quoted strings, 255 chars each, 4000 total."""
    if len(line) > MAX_TXT_VALUE_CHARS:
        return f"A text value can have up to {MAX_TXT_VALUE_CHARS} characters."
    tokens = _tokenize(line)
    if tokens is None:
        return UNMATCHED_QUOTE_ERROR
    if not tokens or any(not _is_quoted(t) for t in tokens):
        return (
            "Enclose each string in double quotation marks, "
            'for example "v=spf1 ip4:192.168.0.1/16 -all".'
        )
    if any(len(t) - 2 > MAX_TXT_STRING_CHARS for t in tokens):
        return (
            f"A single string can have up to {MAX_TXT_STRING_CHARS} characters. "
            "Break longer values into several quoted strings on the same line."
        )
    return None


# RFC 9460 SvcParamKeys 1-8, the set Route 53 documents for HTTPS/SVCB.
_SVC_PARAM_KEYS = (
    "alpn", "no-default-alpn", "port", "ipv4hint", "ech", "ipv6hint", "dohpath", "ohttp",
)


def _validate_svcb(line: str) -> Optional[str]:
    """HTTPS/SVCB share the `SvcPriority TargetName SvcParams` presentation format."""
    tokens = _tokenize(line)
    if tokens is None:
        return UNMATCHED_QUOTE_ERROR
    if len(tokens) < 2:
        return "Enter a priority and a target name, for example 16 example.com."
    if not _int_in_range(tokens[0], 0, 32767):
        return "The priority must be an integer between 0 and 32767."
    if tokens[1] != "." and not _is_dns_name(tokens[1]):
        return "The target name is not a valid domain name."

    for param in tokens[2:]:
        key, _, raw = param.partition("=")
        value = raw[1:-1] if _is_quoted(raw) else raw
        if re.fullmatch(r"key[0-9]+", key):
            return f"Route 53 does not support the unknown-key format {key}."
        if key not in _SVC_PARAM_KEYS:
            return (
                f"{key} is not a supported service parameter. "
                f"Supported keys: {', '.join(_SVC_PARAM_KEYS)}."
            )
        if key == "port" and not _int_in_range(value, 0, 65535):
            return "port must be an integer between 0 and 65535."
        if key == "ipv4hint" and not all(_is_ipv4(v) for v in value.split(",")):
            return "ipv4hint must be a comma-separated list of IPv4 addresses."
        if key == "ipv6hint" and not all(_is_ipv6(v) for v in value.split(",")):
            return "ipv6hint must be a comma-separated list of IPv6 addresses."
        if key == "alpn" and value == "":
            return 'alpn must list at least one protocol ID, for example alpn="h2,h3".'
    return None


def _validate_line(record_type: str, line: str) -> Optional[str]:
    """Returns a human-readable problem with one rdata line, or None when it is valid."""
    if record_type == "A":
        return None if _is_ipv4(line) else "Enter a valid IPv4 address, for example 192.0.2.235."

    if record_type == "AAAA":
        return None if _is_ipv6(line) else (
            "Enter a valid IPv6 address, for example 2001:0db8:85a3:0:0:8a2e:0370:7334."
        )

    if record_type in ("CNAME", "PTR"):
        return None if _is_dns_name(line) else (
            "Enter a valid domain name, for example hostname.example.com."
        )

    if record_type == "NS":
        return None if _is_dns_name(line) else (
            "Enter the domain name of a name server, for example ns-1.example.com."
        )

    if record_type == "MX":
        tokens = line.split()
        if len(tokens) != 2:
            return "Enter a priority and a domain name, for example 10 mail.example.com."
        if not _int_in_range(tokens[0], 0, 65535):
            return "The priority must be an integer between 0 and 65535."
        return None if _is_dns_name(tokens[1]) else "The mail server is not a valid domain name."

    if record_type in ("TXT", "SPF"):
        return _validate_quoted_strings(line)

    if record_type == "SRV":
        tokens = line.split()
        if len(tokens) != 4:
            return (
                "Enter priority, weight, port and target, "
                "for example 10 5 80 hostname.example.com."
            )
        if not _int_in_range(tokens[0], 0, 65535):
            return "The priority must be an integer between 0 and 65535."
        if not _int_in_range(tokens[1], 0, 65535):
            return "The weight must be an integer between 0 and 65535."
        if not _int_in_range(tokens[2], 0, 65535):
            return "The port must be an integer between 0 and 65535."
        return None if _is_dns_name(tokens[3]) else "The target is not a valid domain name."

    if record_type == "NAPTR":
        tokens = _tokenize(line)
        if tokens is None:
            return UNMATCHED_QUOTE_ERROR
        if len(tokens) != 6:
            return (
                "Enter order, preference, flags, service, regexp and replacement, for example "
                '100 50 "u" "E2U+sip" "!^.*$!sip:info@example.com!" .'
            )
        if not _int_in_range(tokens[0], 0, 65535):
            return "The order must be an integer between 0 and 65535."
        if not _int_in_range(tokens[1], 0, 65535):
            return "The preference must be an integer between 0 and 65535."
        if not _is_quoted(tokens[2]):
            return 'Enclose flags in quotation marks, for example "u".'
        if not re.fullmatch(r'"[APSUapsu]?"', tokens[2]):
            return 'Valid flags are "A", "P", "S", "U" or the empty string "".'
        if not _is_quoted(tokens[3]):
            return 'Enclose service in quotation marks, for example "E2U+sip".'
        if not _is_quoted(tokens[4]):
            return 'Enclose regexp in quotation marks, or specify "" and use replacement instead.'
        if tokens[5] != "." and not _is_dns_name(tokens[5]):
            return (
                "Replacement must be a fully qualified domain name, "
                "or a dot (.) when regexp is used."
            )
        return None

    if record_type == "CAA":
        tokens = _tokenize(line)
        if tokens is None:
            return UNMATCHED_QUOTE_ERROR
        if len(tokens) != 3:
            return 'Enter flags, tag and value, for example 0 issue "ca.example.net".'
        if not _int_in_range(tokens[0], 0, 255):
            return "Flags must be an integer between 0 and 255."
        if not re.fullmatch(r"[A-Za-z0-9]+", tokens[1]):
            return "The tag can contain only the characters A-Z, a-z and 0-9."
        return None if _is_quoted(tokens[2]) else (
            'Enclose the value in quotation marks, for example "ca.example.net".'
        )

    if record_type == "DS":
        tokens = line.split()
        if len(tokens) < 4:
            return (
                "Enter key tag, algorithm, digest type and digest, "
                "for example 123 4 5 1234567890abcdef."
            )
        if not _int_in_range(tokens[0], 0, 65535):
            return "The key tag must be an integer between 0 and 65535."
        if not _int_in_range(tokens[1], 0, 255):
            return "The algorithm must be an integer between 0 and 255."
        if not _int_in_range(tokens[2], 0, 255):
            return "The digest type must be an integer between 0 and 255."
        return None if _is_hex("".join(tokens[3:])) else "The digest must be a hexadecimal value."

    if record_type == "TLSA":
        tokens = line.split()
        if len(tokens) < 4:
            return (
                "Enter certificate usage, selector, matching type and certificate "
                "association data, for example 0 0 1 d2abde24..."
            )
        if not _int_in_range(tokens[0], 0, 3):
            return "Certificate usage must be 0, 1, 2 or 3."
        if not _int_in_range(tokens[1], 0, 1):
            return "Selector must be 0 or 1."
        if not _int_in_range(tokens[2], 0, 2):
            return "Matching type must be 0, 1 or 2."
        return None if _is_hex("".join(tokens[3:])) else (
            "The certificate association data must be a hexadecimal value."
        )

    if record_type == "SSHFP":
        tokens = line.split()
        if len(tokens) < 3:
            return (
                "Enter key algorithm, hash type and fingerprint, "
                "for example 1 1 09F6A01D2175742B..."
            )
        # 0 is reserved and 5 is unassigned, so they are not offered.
        if tokens[0] not in ("1", "2", "3", "4", "6"):
            return "Key algorithm must be 1 (RSA), 2 (DSA), 3 (ECDSA), 4 (Ed25519) or 6 (Ed448)."
        if tokens[1] not in ("1", "2"):
            return "Hash type must be 1 (SHA-1) or 2 (SHA-256)."
        return None if _is_hex("".join(tokens[2:])) else (
            "The fingerprint must be a hexadecimal value."
        )

    if record_type in ("HTTPS", "SVCB"):
        return _validate_svcb(line)

    if record_type == "SOA":
        # Not creatable through the API (Route 53 owns it), but PUT can reach a seeded SOA.
        tokens = line.split()
        if len(tokens) != 7:
            return (
                "Enter a primary name server, responsible party and five integers, for example "
                "ns-2048.awsdns-64.net hostmaster.awsdns.com 1 1 1 1 60."
            )
        if not _is_dns_name(tokens[0]):
            return "The primary name server is not a valid domain name."
        if not _is_dns_name(tokens[1]):
            return "The responsible party is not a valid domain name."
        return None if all(re.fullmatch(r"[0-9]+", t) for t in tokens[2:]) else (
            "Serial, refresh, retry, expire and minimum TTL must be integers."
        )

    return None


def validate_record_value(record_type: str, value: str) -> str:
    """Validates every non-blank line of a record's value and returns it normalised.

    Exposed for the route layer: RecordUpdate carries no type of its own, so PUT has to
    pass the stored record's type in.
    """
    rtype = (record_type or "").upper()
    filled = [
        (n, text.strip())
        for n, text in enumerate((value or "").split("\n"), start=1)
        if text.strip()
    ]
    if not filled:
        raise ValueError(VALUE_REQUIRED_ERROR)

    # The DNS protocol allows a single canonical name only.
    if rtype == "CNAME" and len(filled) > 1:
        raise ValueError("A CNAME record can have only one value.")

    for n, text in filled:
        error = _validate_line(rtype, text)
        if error:
            raise ValueError(f"Line {n}: {error}" if len(filled) > 1 else error)
    return "\n".join(text for _, text in filled)


def validate_alias_target(value: str) -> str:
    """Validate an alias record's target.

    An alias record's value is the DNS name of an AWS endpoint (or of another record in the
    same hosted zone), not type-specific rdata — Route 53 answers with the target's value and
    uses the target's TTL, which is why alias records carry no TTL of their own. Applying the
    per-type rdata rules here would reject a perfectly valid alias, e.g. an A-type alias
    pointing at an ELB hostname.
    """
    v = value.strip()
    if not v:
        raise ValueError("Choose the endpoint that the alias should route traffic to.")
    if "\n" in v:
        raise ValueError("An alias record can have only one target.")
    if not _is_dns_name(v):
        raise ValueError(
            "Enter a valid alias target, for example "
            "dualstack.my-lb-1234567890.us-east-1.elb.amazonaws.com."
        )
    return v


def normalize_record_name(name: str, record_type: Optional[str] = None) -> str:
    """Validates a record name and returns it as a lowercase FQDN with a trailing dot.

    Route 53 treats `www.example.com` and `www.example.com.` as identical and stores
    letters lowercased, so without this both spellings become separate rows.
    """
    v = (name or "").strip().lower()
    if v.endswith("."):
        v = v[:-1]
    if v == "":
        raise ValueError("Record name is required.")
    if len(v.encode("utf-8")) > MAX_NAME_BYTES:
        raise ValueError(
            f"A record name can have up to {MAX_NAME_BYTES} characters, "
            "including the hosted zone name."
        )

    rtype = (record_type or "").upper()
    for i, label in enumerate(v.split(".")):
        if label == "*":
            if rtype == "NS":
                raise ValueError("You can't use the * wildcard in the name of an NS record.")
            if i != 0:
                raise ValueError(
                    "The * wildcard must replace the leftmost label, for example *.example.com."
                )
            continue
        if label == "":
            raise ValueError("The record name contains an empty label.")
        if len(label.encode("utf-8")) > MAX_LABEL_BYTES:
            raise ValueError(
                f"Each label in a record name can have up to {MAX_LABEL_BYTES} characters."
            )
        if "*" in label:
            raise ValueError(
                "The * wildcard must replace an entire label, for example *.example.com."
            )
        if not _LABEL_RE.match(label):
            raise ValueError(LEGAL_CHARS_ERROR)
    return v + "."


def validate_routing_policy(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if value not in ROUTING_POLICIES:
        raise ValueError(f"routing_policy must be one of: {', '.join(ROUTING_POLICIES)}")
    return value


class RecordCreate(BaseModel):
    name: str
    type: str
    # Alias records legitimately carry no TTL, so None stays valid.
    ttl: Optional[int] = Field(default=300, ge=TTL_MIN, le=TTL_MAX)
    value: str
    routing_policy: Optional[str] = "Simple"
    comment: Optional[str] = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        v = v.upper()
        if v not in VALID_RECORD_TYPES:
            raise ValueError(f"type must be one of: {', '.join(sorted(VALID_RECORD_TYPES))}")
        return v

    @field_validator("routing_policy")
    @classmethod
    def check_routing_policy(cls, v: Optional[str]) -> Optional[str]:
        return validate_routing_policy(v)

    @model_validator(mode="after")
    def check_name_and_value(self):
        # Runs after field validation so `type` is already normalised to upper case; name and
        # value both need it, and a field validator can't see a later-declared field.
        self.name = normalize_record_name(self.name, self.type)
        # A null TTL is how this clone marks an alias record, whose value is an endpoint name
        # rather than rdata for `type`, so the per-type rules must not be applied to it.
        self.value = (
            validate_alias_target(self.value)
            if self.ttl is None
            else validate_record_value(self.type, self.value)
        )
        return self


class RecordUpdate(BaseModel):
    name: Optional[str] = None
    ttl: Optional[int] = Field(default=None, ge=TTL_MIN, le=TTL_MAX)
    value: Optional[str] = None
    routing_policy: Optional[str] = None
    comment: Optional[str] = None

    @field_validator("name")
    @classmethod
    def check_name(cls, v: Optional[str]) -> Optional[str]:
        # The NS-wildcard rule needs the stored record's type; the route layer supplies it.
        return None if v is None else normalize_record_name(v)

    @field_validator("routing_policy")
    @classmethod
    def check_routing_policy(cls, v: Optional[str]) -> Optional[str]:
        return validate_routing_policy(v)


class RecordOut(BaseModel):
    id: int
    zone_id: int
    name: str
    type: str
    ttl: Optional[int] = None
    value: str
    routing_policy: Optional[str] = None
    comment: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RecordListResponse(BaseModel):
    items: List[RecordOut]
    total: int
    page: int
    limit: int
    pages: int


class ImportZoneRequest(BaseModel):
    zone_file: str


class ImportZoneResponse(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: List[str] = []