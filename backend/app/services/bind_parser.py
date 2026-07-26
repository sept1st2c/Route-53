"""Minimal BIND zone-file parser — enough to power the "Import zone file" feature.

Supports the common subset of RFC 1035 master-file syntax:
  - `$ORIGIN` and `$TTL` directives
  - comments (`;` to end of line, outside quotes)
  - multi-line records wrapped in parentheses ( ... )
  - owner-name inheritance (a line starting with whitespace reuses the previous name)
  - `@` for the zone apex and relative names (auto-qualified against the origin)
  - records of the form:  [name] [ttl] [class] TYPE rdata

Records that share the same (name, type) are merged into one record set whose value is
newline-separated — matching how DNSRecord stores multi-value records.
"""
from typing import List, Dict


def _strip_comment(line: str) -> str:
    """Remove a trailing `;` comment, ignoring semicolons inside quoted strings (TXT)."""
    out, in_quote = [], False
    for ch in line:
        if ch == '"':
            in_quote = not in_quote
        if ch == ";" and not in_quote:
            break
        out.append(ch)
    return "".join(out)


def _qualify(name: str, origin: str) -> str:
    """Turn a possibly-relative owner name into a fully-qualified, dot-terminated name."""
    if name == "@":
        return origin
    if name.endswith("."):
        return name
    return f"{name}.{origin}" if origin else f"{name}."


CLASSES = {"IN", "CH", "HS", "CS"}


def parse_zone_file(text: str, default_origin: str, default_ttl: int = 300) -> Dict:
    """Parse BIND text. Returns {records: [{name,type,ttl,value}], errors: [str]}.

    `default_origin` should be the hosted-zone name (e.g. "example.com.").
    """
    origin = default_origin if default_origin.endswith(".") else default_origin + "."
    ttl_default = default_ttl
    errors: List[str] = []

    # 1) Pre-process: strip comments, then fold parenthesised multi-line records into one line.
    logical_lines: List[str] = []
    buffer = ""
    depth = 0
    for raw in text.splitlines():
        line = _strip_comment(raw)
        if not line.strip() and depth == 0:
            continue
        depth += line.count("(") - line.count(")")
        cleaned = line.replace("(", " ").replace(")", " ")
        buffer += (" " + cleaned) if buffer else cleaned
        if depth <= 0:
            logical_lines.append(buffer.strip())
            buffer = ""
            depth = 0
    if buffer.strip():
        logical_lines.append(buffer.strip())

    # 2) Parse each logical line.
    grouped: Dict[tuple, Dict] = {}
    order: List[tuple] = []
    last_name = origin

    for line in logical_lines:
        if not line:
            continue

        # Directives
        if line.upper().startswith("$ORIGIN"):
            parts = line.split()
            if len(parts) >= 2:
                origin = parts[1] if parts[1].endswith(".") else parts[1] + "."
            continue
        if line.upper().startswith("$TTL"):
            parts = line.split()
            if len(parts) >= 2 and parts[1].isdigit():
                ttl_default = int(parts[1])
            continue

        starts_with_ws = line[0].isspace()
        tokens = line.split()
        if not tokens:
            continue

        # Owner name
        if starts_with_ws:
            name = last_name
        else:
            name = _qualify(tokens.pop(0), origin)
        last_name = name

        # Optional TTL and class, in either order
        ttl = ttl_default
        while tokens and (tokens[0].isdigit() or tokens[0].upper() in CLASSES):
            tok = tokens.pop(0)
            if tok.isdigit():
                ttl = int(tok)
            # class token is simply skipped

        if not tokens:
            errors.append(f"Skipped line (no record type): {line}")
            continue

        rtype = tokens.pop(0).upper()
        rdata = " ".join(tokens).strip()
        if not rdata:
            errors.append(f"Skipped {rtype} record for {name} (no value)")
            continue

        key = (name, rtype)
        if key not in grouped:
            grouped[key] = {"name": name, "type": rtype, "ttl": ttl, "values": []}
            order.append(key)
        grouped[key]["values"].append(rdata)
        # smallest TTL wins for a record set, like most resolvers
        grouped[key]["ttl"] = min(grouped[key]["ttl"], ttl)

    records = [
        {"name": g["name"], "type": g["type"], "ttl": g["ttl"], "value": "\n".join(g["values"])}
        for g in (grouped[k] for k in order)
    ]
    return {"records": records, "errors": errors}
