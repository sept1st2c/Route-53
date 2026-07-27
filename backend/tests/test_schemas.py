"""Validation tests for the record schemas.

The rdata samples are the examples AWS publishes in ResourceRecordTypes.html, so a
failure here means the API diverged from the documented format — and from
frontend/src/lib/dnsValidation.ts, which the console form validates against.
"""
import pytest
from pydantic import ValidationError

from app.schemas import (
    ROUTING_POLICIES,
    TTL_MAX,
    RecordCreate,
    RecordUpdate,
    normalize_record_name,
    validate_record_value,
)


def make(**overrides) -> RecordCreate:
    payload = {"name": "www.example.com", "type": "A", "value": "192.0.2.1"}
    payload.update(overrides)
    return RecordCreate(**payload)


def rejection(**overrides) -> str:
    with pytest.raises(ValidationError) as exc:
        make(**overrides)
    return str(exc.value)


# ─── per-type rdata ───────────────────────────────────────────────────────────

VALID_RDATA = [
    ("A", "192.0.2.235"),
    ("AAAA", "2001:0db8:85a3:0:0:8a2e:0370:7334"),
    ("AAAA", "2001:db8::1"),
    ("CNAME", "hostname.example.com"),
    ("CNAME", "hostname.example.com."),
    ("MX", "10 mail.example.com"),
    ("TXT", '"v=spf1 ip4:192.168.0.1/16 -all"'),
    ("TXT", '"String 1" "String 2" "String 3"'),
    ("PTR", "hostname.example.com"),
    ("SRV", "1 10 5269 xmpp-server.example.com."),
    ("SPF", '"v=spf1 ip4:192.168.0.1/16 -all"'),
    ("NAPTR", '100 50 "u" "E2U+sip" "!^.*$!sip:info@example.com!" .'),
    ("NAPTR", '100 52 "u" "E2U+email:mailto" "!^.*$!mailto:info@example.com!" .'),
    ("CAA", '0 issue "ca.example.net"'),
    ("CAA", '0 iodef "mailto:admin@example.com"'),
    ("CAA", '128 exampletag "15555551212"'),
    ("NS", "ns-1.example.com"),
    ("DS", "123 4 5 1234567890abcdef1234567890abcdef"),
    ("TLSA", "0 0 1 d2abde240d7cd3ee6b4b28c54df034b97983a1d16e8a410e4561cb106618e971"),
    ("SSHFP", "1 1 09F6A01D2175742B257C6B98B7C72C44C4040683"),
    # SvcPriority 0 is alias mode; 1-32767 is service mode.
    ("HTTPS", "0 example.com"),
    ("HTTPS", '16 example.com alpn="h2,h3" port=808'),
    ("SVCB", "0 example.com"),
    ("SVCB", '16 example.com alpn="h2,h3" port=808'),
    ("SVCB", "1 example.com ipv4hint=192.0.2.1,192.0.2.2 no-default-alpn"),
]

INVALID_RDATA = [
    # A / AAAA
    ("A", "hello", "IPv4"),
    ("A", "192.0.2.256", "IPv4"),
    ("A", "192.0.2", "IPv4"),
    ("A", "2001:db8::1", "IPv4"),
    ("AAAA", "hello", "IPv6"),
    ("AAAA", "192.0.2.1", "IPv6"),
    ("AAAA", "2001:db8:::1", "IPv6"),
    ("AAAA", "2001:0db8:85a3:0:0:8a2e:0370:7334:9999", "IPv6"),
    # domain-name types
    ("CNAME", "not a hostname", "valid domain name"),
    ("CNAME", "hostname..example.com", "valid domain name"),
    ("PTR", "-bad.example.com", "valid domain name"),
    ("NS", "ns 1.example.com", "name server"),
    # MX
    ("MX", "mail.example.com", "priority and a domain name"),
    ("MX", "10 5 mail.example.com", "priority and a domain name"),
    ("MX", "70000 mail.example.com", "between 0 and 65535"),
    ("MX", "ten mail.example.com", "between 0 and 65535"),
    ("MX", "10 mail example.com", "priority and a domain name"),
    # TXT / SPF
    ("TXT", "v=spf1 ip4:192.168.0.1/16 -all", "double quotation marks"),
    ("TXT", '"unterminated', "unmatched double quotation mark"),
    ("TXT", '"' + "a" * 256 + '"', "up to 255 characters"),
    ("TXT", '"' + "a" * 4001 + '"', "up to 4000 characters"),
    ("SPF", "v=spf1 -all", "double quotation marks"),
    # SRV
    ("SRV", "10 5 80", "priority, weight, port and target"),
    ("SRV", "10 5 70000 hostname.example.com", "port must be an integer"),
    ("SRV", "10 70000 80 hostname.example.com", "weight must be an integer"),
    # NAPTR
    ("NAPTR", '100 50 "u" "E2U+sip" "!^.*$!sip:info@example.com!"', "order, preference, flags"),
    ("NAPTR", '100 50 u "E2U+sip" "!^.*$!sip:info@example.com!" .', "Enclose flags"),
    ("NAPTR", '100 50 "Z" "E2U+sip" "!^.*$!sip:info@example.com!" .', "Valid flags are"),
    ("NAPTR", '100 50 "u" "E2U+sip" "!^.*$!x!" not a name', "order, preference, flags"),
    # CAA
    ("CAA", "0 issue ca.example.net", "Enclose the value in quotation marks"),
    ("CAA", '300 issue "ca.example.net"', "Flags must be an integer between 0 and 255"),
    ("CAA", '0 iss-ue "ca.example.net"', "tag can contain only"),
    # DS
    ("DS", "123 4 5", "key tag, algorithm, digest type and digest"),
    ("DS", "123 4 5 zzzz", "digest must be a hexadecimal value"),
    ("DS", "123 400 5 abcdef", "algorithm must be an integer between 0 and 255"),
    # TLSA
    ("TLSA", "4 0 1 d2abde24", "Certificate usage must be 0, 1, 2 or 3"),
    ("TLSA", "0 2 1 d2abde24", "Selector must be 0 or 1"),
    ("TLSA", "0 0 3 d2abde24", "Matching type must be 0, 1 or 2"),
    ("TLSA", "0 0 1 nothex", "hexadecimal value"),
    # SSHFP
    ("SSHFP", "5 1 09F6A01D", "Key algorithm must be 1"),
    ("SSHFP", "1 3 09F6A01D", "Hash type must be 1"),
    ("SSHFP", "1 1 zzz", "fingerprint must be a hexadecimal value"),
    # HTTPS / SVCB
    ("HTTPS", "example.com", "priority and a target name"),
    ("HTTPS", "40000 example.com", "between 0 and 32767"),
    ("HTTPS", "16 not a name", "not a supported service parameter"),
    ("HTTPS", "16 example.com port=99999", "port must be an integer between 0 and 65535"),
    ("HTTPS", "16 example.com bogus=1", "not a supported service parameter"),
    ("HTTPS", "16 example.com key65280=abc", "unknown-key format"),
    ("SVCB", "16 example.com ipv4hint=1.2.3.999", "ipv4hint"),
    ("SVCB", "16 example.com ipv6hint=nope", "ipv6hint"),
    ("SVCB", '16 example.com alpn=""', "at least one protocol ID"),
]


@pytest.mark.parametrize("rtype,value", VALID_RDATA)
def test_documented_rdata_is_accepted(rtype, value):
    assert make(type=rtype, value=value).value == value


@pytest.mark.parametrize("rtype,value,expected", INVALID_RDATA)
def test_malformed_rdata_is_rejected(rtype, value, expected):
    assert expected in rejection(type=rtype, value=value)


def test_every_supported_type_has_a_valid_and_an_invalid_case():
    from app.schemas import VALID_RECORD_TYPES

    assert {t for t, _ in VALID_RDATA} == VALID_RECORD_TYPES
    assert {t for t, _, _ in INVALID_RDATA} == VALID_RECORD_TYPES


def test_unsupported_type_is_rejected():
    # Route 53 manages SOA itself, so it is not creatable through the API.
    assert "type must be one of" in rejection(type="SOA", value="x")


def test_type_is_upper_cased():
    assert make(type="aaaa", value="2001:db8::1").type == "AAAA"


# ─── multi-value records ──────────────────────────────────────────────────────

def test_every_line_of_a_multi_value_record_is_validated():
    assert "Line 3:" in rejection(type="A", value="192.0.2.1\n192.0.2.2\nhello")


def test_single_value_errors_are_not_line_prefixed():
    assert "Line" not in rejection(type="A", value="hello")


def test_blank_lines_and_surrounding_whitespace_are_stripped():
    record = make(type="A", value="  192.0.2.1  \n\n  192.0.2.2\n")
    assert record.value == "192.0.2.1\n192.0.2.2"


def test_empty_value_is_rejected():
    assert "required to have value" in rejection(value="   \n  \n")


def test_cname_accepts_exactly_one_value():
    assert make(type="CNAME", value="one.example.com").value == "one.example.com"
    assert "only one value" in rejection(
        type="CNAME", value="one.example.com\ntwo.example.com"
    )


def test_other_types_accept_several_values():
    value = "10 mail1.example.com\n20 mail2.example.com"
    assert make(type="MX", value=value).value == value


# ─── TTL ──────────────────────────────────────────────────────────────────────

def test_ttl_defaults_to_300():
    assert make().ttl == 300


@pytest.mark.parametrize("ttl", [0, 60, 172800, TTL_MAX])
def test_ttl_inside_the_documented_range_is_accepted(ttl):
    assert make(ttl=ttl).ttl == ttl


def test_ttl_none_stays_valid_for_alias_records():
    assert make(ttl=None).ttl is None
    assert RecordUpdate(ttl=None).ttl is None


@pytest.mark.parametrize("ttl", [-1, TTL_MAX + 1])
def test_ttl_outside_the_documented_range_is_rejected(ttl):
    rejection(ttl=ttl)
    with pytest.raises(ValidationError):
        RecordUpdate(ttl=ttl)


# ─── record name ──────────────────────────────────────────────────────────────

def test_name_is_lower_cased_and_gets_a_trailing_dot():
    assert make(name="WWW.Example.COM").name == "www.example.com."
    assert make(name="www.example.com.").name == "www.example.com."
    assert make(name="  www.example.com  ").name == "www.example.com."


def test_the_two_spellings_of_a_name_collapse_to_one():
    assert make(name="WWW.example.com").name == make(name="www.example.com.").name


def test_apex_name_is_accepted():
    assert make(name="example.com.").name == "example.com."


def test_underscore_names_are_accepted():
    # _dmarc and _sip._tcp style names are legal for hosted zones and records.
    assert make(name="_dmarc.example.com", type="TXT", value='"v=DMARC1; p=none"').name == (
        "_dmarc.example.com."
    )


def test_wildcard_replacing_the_leftmost_label_is_accepted():
    assert make(name="*.example.com").name == "*.example.com."


def test_wildcard_in_a_middle_label_is_rejected():
    assert "leftmost label" in rejection(name="marketing.*.example.com")


def test_wildcard_must_replace_the_whole_label():
    assert "entire label" in rejection(name="prod*.example.com")


def test_ns_records_cannot_use_the_wildcard():
    assert "NS record" in rejection(name="*.example.com", type="NS", value="ns-1.example.com")


def test_label_longer_than_63_characters_is_rejected():
    assert "63 characters" in rejection(name="a" * 64 + ".example.com")


def test_label_of_exactly_63_characters_is_accepted():
    assert make(name="a" * 63 + ".example.com").name == "a" * 63 + ".example.com."


def test_name_longer_than_255_characters_is_rejected():
    long_name = ".".join(["a" * 50] * 5) + ".example.com"
    assert "255 characters" in rejection(name=long_name)


def test_empty_label_is_rejected():
    assert "empty label" in rejection(name="www..example.com")


def test_illegal_characters_in_a_name_are_rejected():
    assert "Valid characters" in rejection(name="www example.com")


def test_octal_escape_codes_are_accepted():
    # DomainNameFormat requires \DDD for characters outside the printable ASCII set.
    assert make(name="ex\\344mple.example.com").name == "ex\\344mple.example.com."


def test_blank_name_is_rejected():
    assert "required" in rejection(name="   ")


# ─── routing policy ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("policy", ROUTING_POLICIES)
def test_all_eight_console_routing_policies_are_accepted(policy):
    assert make(routing_policy=policy).routing_policy == policy


def test_routing_policy_defaults_to_simple():
    assert make().routing_policy == "Simple"


def test_unknown_routing_policy_is_rejected():
    assert "routing_policy must be one of" in rejection(routing_policy="Fastest")
    with pytest.raises(ValidationError):
        RecordUpdate(routing_policy="Fastest")


def test_routing_policy_is_case_sensitive():
    assert "routing_policy must be one of" in rejection(routing_policy="simple")


# ─── RecordUpdate ─────────────────────────────────────────────────────────────

def test_update_normalises_the_name():
    assert RecordUpdate(name="WWW.example.com").name == "www.example.com."


def test_update_leaves_omitted_fields_alone():
    payload = RecordUpdate()
    assert payload.name is None and payload.value is None and payload.ttl is None


def test_update_value_is_validated_by_the_reusable_helper():
    # RecordUpdate has no type field, so the route layer passes the stored record's type.
    assert validate_record_value("A", " 192.0.2.1 ") == "192.0.2.1"
    with pytest.raises(ValueError, match="IPv4"):
        validate_record_value("A", "hello")
    with pytest.raises(ValueError, match="only one value"):
        validate_record_value("CNAME", "a.example.com\nb.example.com")


def test_reusable_helper_accepts_a_lower_case_type():
    assert validate_record_value("mx", "10 mail.example.com") == "10 mail.example.com"


# ─── backward compatibility with the seeded defaults ──────────────────────────

SEEDED_NS = (
    "ns-1.awsdns-1.com.\nns-2.awsdns-2.net.\nns-3.awsdns-3.co.uk.\nns-4.awsdns-4.org."
)
SEEDED_SOA = "ns-1.awsdns-1.com. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400"


def test_seeded_apex_ns_record_still_validates():
    record = make(name="example.com.", type="NS", ttl=172800, value=SEEDED_NS)
    assert record.value == SEEDED_NS


def test_seeded_soa_value_still_validates_on_update():
    # seed_default_ns_soa writes SOA straight through the ORM, but a PUT can still reach it.
    assert validate_record_value("SOA", SEEDED_SOA) == SEEDED_SOA


def test_malformed_soa_is_rejected_by_the_helper():
    with pytest.raises(ValueError, match="five integers"):
        validate_record_value("SOA", "ns-1.example.com. hostmaster.example.com. 1")


def test_normalize_record_name_is_reusable_without_a_type():
    assert normalize_record_name("WWW.Example.com") == "www.example.com."


# ── Alias records ────────────────────────────────────────────────────────────────
# An alias record is marked by a null TTL and its value is an endpoint name, not rdata
# for its `type`. This spans three files that each looked correct alone: the form writes
# `type: "A"` with a hostname, the ORM used to rewrite the null TTL to 300, and the value
# validator required an IPv4 — so an alias A record was impossible to create.


def test_alias_a_record_accepts_an_aws_endpoint_hostname():
    r = RecordCreate(
        name="alias.example.com",
        type="A",
        ttl=None,
        value="dualstack.my-lb-1234567890.us-east-1.elb.amazonaws.com",
    )
    assert r.ttl is None
    assert r.value == "dualstack.my-lb-1234567890.us-east-1.elb.amazonaws.com"


def test_non_alias_a_record_still_requires_an_ipv4():
    with pytest.raises(ValidationError):
        RecordCreate(name="www.example.com", type="A", ttl=300, value="not-an-ip")


def test_alias_target_cannot_be_blank():
    with pytest.raises(ValidationError):
        RecordCreate(name="alias.example.com", type="A", ttl=None, value="   ")


def test_alias_record_allows_only_one_target():
    with pytest.raises(ValidationError):
        RecordCreate(
            name="alias.example.com", type="A", ttl=None, value="a.elb.amazonaws.com\nb.elb.amazonaws.com"
        )


def test_alias_target_must_be_a_dns_name():
    with pytest.raises(ValidationError):
        RecordCreate(name="alias.example.com", type="A", ttl=None, value="not a hostname!!")


def test_alias_aaaa_record_is_not_forced_to_be_ipv6():
    r = RecordCreate(
        name="alias6.example.com", type="AAAA", ttl=None, value="d123.cloudfront.net"
    )
    assert r.value == "d123.cloudfront.net"
