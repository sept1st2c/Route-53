"""Regression tests for the BIND zone-file parser used by "Import zone file".

The owner-name inheritance cases below cover a real bug: the folded logical line
was stripped before its indentation was inspected, so RFC 1035's "a line starting
with whitespace reuses the previous owner name" never applied. The class token was
consumed as the owner instead, silently importing records named `IN.<zone>`.
"""
from app.services.bind_parser import parse_zone_file

ORIGIN = "example.com."


def triples(zone: str):
    parsed = parse_zone_file(zone, default_origin=ORIGIN)
    return [(r["name"], r["type"], r["value"]) for r in parsed["records"]]


def test_indented_line_inherits_previous_owner_name():
    zone = """$ORIGIN example.com.
$TTL 300
www   IN A   192.0.2.1
      IN A   192.0.2.2
mail  IN A   192.0.2.9
"""
    assert triples(zone) == [
        ("www.example.com.", "A", "192.0.2.1\n192.0.2.2"),
        ("mail.example.com.", "A", "192.0.2.9"),
    ]


def test_class_token_is_never_treated_as_an_owner_name():
    zone = "www IN A 1.2.3.4\n     IN A 5.6.7.8\n"
    assert all(not name.startswith("IN.") for name, _, _ in triples(zone))


def test_explicit_owner_names_are_unaffected():
    zone = """$ORIGIN example.com.
a IN A 10.0.0.1
b IN A 10.0.0.2
"""
    assert triples(zone) == [
        ("a.example.com.", "A", "10.0.0.1"),
        ("b.example.com.", "A", "10.0.0.2"),
    ]


def test_apex_shorthand_with_inheritance():
    zone = """$ORIGIN example.com.
@  IN MX 10 mail1.example.com.
   IN MX 20 mail2.example.com.
"""
    assert triples(zone) == [
        ("example.com.", "MX", "10 mail1.example.com.\n20 mail2.example.com."),
    ]


def test_parenthesised_record_keeps_its_explicit_owner():
    zone = """$ORIGIN example.com.
@ IN SOA ns1.example.com. host.example.com. (
    1 7200 900 1209600 86400 )
"""
    assert triples(zone) == [
        ("example.com.", "SOA", "ns1.example.com. host.example.com. 1 7200 900 1209600 86400"),
    ]


def test_indented_line_following_a_folded_record_inherits_the_apex():
    """The indentation flag has to survive parenthesis folding, not just single lines."""
    zone = """$ORIGIN example.com.
@ IN SOA ns1.example.com. host.example.com. (
    1 7200 900 1209600 86400 )
  IN NS ns1.example.com.
"""
    assert triples(zone) == [
        ("example.com.", "SOA", "ns1.example.com. host.example.com. 1 7200 900 1209600 86400"),
        ("example.com.", "NS", "ns1.example.com."),
    ]


def test_origin_and_ttl_directives_apply():
    zone = """$ORIGIN sub.example.com.
$TTL 900
host IN A 203.0.113.7
"""
    parsed = parse_zone_file(zone, default_origin=ORIGIN)
    assert parsed["records"] == [
        {"name": "host.sub.example.com.", "type": "A", "ttl": 900, "value": "203.0.113.7"}
    ]


def test_comments_outside_quotes_are_stripped_but_kept_inside_txt():
    zone = 'txt IN TXT "v=spf1; include:_spf.example.com -all" ; trailing comment\n'
    assert triples(zone) == [
        ("txt.example.com.", "TXT", '"v=spf1; include:_spf.example.com -all"'),
    ]
