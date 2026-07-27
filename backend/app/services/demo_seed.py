"""Populates the demo account with realistic hosted zones and records.

Render's free plan gives the service an ephemeral filesystem, so route53.db is rebuilt
from scratch on every deploy and every wake-from-idle. Seeding therefore has to happen
on startup rather than once via a migration or a marker file — there is nowhere durable
to record that it already ran, so the presence of the demo user's own zones is the flag.

Every name and value below is pushed through the same validators the API uses, so the
demo data can never be something the console itself would reject.
"""
import logging
from typing import List, Tuple

from sqlalchemy.orm import Session

from app.models import DNSRecord, HostedZone, User
from app.routes.zones import generate_zone_id, seed_default_ns_soa
from app.schemas import normalize_record_name, validate_record_value

logger = logging.getLogger(__name__)

# Must match the account app.routes.auth.seed_demo_user creates.
DEMO_EMAIL = "demo@route53.aws"

# Addresses come from the ranges RFC 5737 / RFC 3849 reserve for documentation, so
# nothing here can ever resolve to or be confused with a real host.
#   192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24, 2001:db8::/32

# (name, type, ttl, [value lines], comment). The apex NS and SOA records are omitted
# on purpose: seed_default_ns_soa creates them, and the route layer treats them as
# read-only Route 53-managed records.
RecordSpec = Tuple[str, str, int, List[str], str]

DEMO_ZONES: List[dict] = [
    {
        "name": "example.com.",
        "type": "Public",
        "comment": "Public zone for the storefront and marketing site",
        "records": [
            (
                "example.com.", "A", 60,
                ["192.0.2.10", "192.0.2.11", "192.0.2.12"],
                "Apex load balancer targets (us-east-1)",
            ),
            (
                "example.com.", "AAAA", 60,
                ["2001:db8::10", "2001:db8::11"],
                "Dual-stack listeners for the apex",
            ),
            (
                "example.com.", "MX", 3600,
                ["10 mail1.example.com.", "20 mail2.example.com."],
                "Inbound mail, primary and backup",
            ),
            (
                "example.com.", "TXT", 300,
                ['"v=spf1 ip4:192.0.2.0/24 -all"'],
                "SPF policy",
            ),
            (
                "example.com.", "CAA", 300,
                ['0 issue "ca.example.net"', '0 iodef "mailto:security@example.com"'],
                "Restrict certificate issuance to the corporate CA",
            ),
            (
                "www.example.com.", "CNAME", 300,
                ["example.com."],
                "www redirects to the apex",
            ),
            (
                "mail1.example.com.", "A", 3600,
                ["192.0.2.20"],
                "Primary mail exchanger",
            ),
            (
                "mail2.example.com.", "A", 3600,
                ["192.0.2.21"],
                "Backup mail exchanger",
            ),
            (
                "_dmarc.example.com.", "TXT", 300,
                ['"v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@example.com"'],
                "DMARC reporting policy",
            ),
            (
                "_sip._tcp.example.com.", "SRV", 300,
                ["10 60 5060 sip.example.com."],
                "SIP service discovery",
            ),
        ],
    },
    {
        "name": "example.net.",
        "type": "Public",
        "comment": "Public zone for the API and edge delivery endpoints",
        "records": [
            (
                "example.net.", "A", 60,
                ["198.51.100.10", "198.51.100.11"],
                "Apex web tier",
            ),
            (
                "example.net.", "TXT", 300,
                ['"v=spf1 -all"'],
                "This zone sends no mail",
            ),
            (
                "example.net.", "CAA", 300,
                ['0 issue "ca.example.net"'],
                "Restrict certificate issuance to the corporate CA",
            ),
            (
                "api.example.net.", "A", 30,
                ["198.51.100.20", "198.51.100.21", "198.51.100.22"],
                "API gateway fleet, short TTL for fast failover",
            ),
            (
                "api.example.net.", "AAAA", 30,
                ["2001:db8:1::20"],
                "IPv6 entry point for the API gateway",
            ),
            (
                "cdn.example.net.", "CNAME", 3600,
                ["edge.example.net."],
                "Content delivery alias for static assets",
            ),
            (
                "edge.example.net.", "A", 300,
                ["198.51.100.30", "198.51.100.31"],
                "Edge cache nodes",
            ),
            (
                "*.dev.example.net.", "A", 300,
                ["198.51.100.40"],
                "Wildcard for ephemeral developer environments",
            ),
            (
                "_acme-challenge.api.example.net.", "TXT", 60,
                ['"placeholder-validation-token-not-in-use"'],
                "ACME DNS-01 validation record",
            ),
        ],
    },
    {
        "name": "internal.example.com.",
        "type": "Private",
        "comment": "Private zone resolved only inside the shared-services VPC",
        "records": [
            (
                "internal.example.com.", "A", 300,
                ["203.0.113.10"],
                "Internal service catalogue landing page",
            ),
            (
                "internal.example.com.", "TXT", 300,
                ['"owner=platform-engineering"'],
                "Ownership metadata for the inventory scanner",
            ),
            (
                "app.internal.example.com.", "CNAME", 300,
                ["lb.internal.example.com."],
                "Application entry point behind the internal load balancer",
            ),
            (
                "lb.internal.example.com.", "A", 60,
                ["203.0.113.40", "203.0.113.41"],
                "Internal load balancer nodes",
            ),
            (
                "db.internal.example.com.", "A", 60,
                ["203.0.113.20", "203.0.113.21"],
                "Primary and replica database endpoints",
            ),
            (
                "cache.internal.example.com.", "A", 60,
                ["203.0.113.30"],
                "In-VPC cache cluster",
            ),
            (
                "cache.internal.example.com.", "AAAA", 60,
                ["2001:db8:2::30"],
                "IPv6 address of the cache cluster",
            ),
            (
                "dc1.internal.example.com.", "A", 3600,
                ["203.0.113.50"],
                "Directory controller, availability zone a",
            ),
            (
                "dc2.internal.example.com.", "A", 3600,
                ["203.0.113.51"],
                "Directory controller, availability zone b",
            ),
            (
                "_ldap._tcp.internal.example.com.", "SRV", 300,
                [
                    "0 100 389 dc1.internal.example.com.",
                    "0 100 389 dc2.internal.example.com.",
                ],
                "LDAP service discovery for domain-joined hosts",
            ),
        ],
    },
]


def validated_specs() -> List[dict]:
    """Normalise and validate every zone's records without touching the database.

    Doing this first means a typo in the data above fails before anything is written,
    so a bad spec can't leave the demo account holding a half-populated zone.
    """
    prepared = []
    for zone_spec in DEMO_ZONES:
        records = [
            {
                "name": normalize_record_name(name, rtype),
                "type": rtype,
                "ttl": ttl,
                "value": validate_record_value(rtype, "\n".join(values)),
                "comment": comment,
            }
            for name, rtype, ttl, values, comment in zone_spec["records"]
        ]
        prepared.append({**zone_spec, "records": records})
    return prepared


def _seed(db: Session) -> None:
    demo = db.query(User).filter(User.email == DEMO_EMAIL).first()
    if not demo:
        # seed_demo_user runs first on startup; if the account still isn't there,
        # something else is wrong and inventing an owner would be worse than doing nothing.
        return

    # The only account that is ever seeded, and only while it is empty. Anything the
    # evaluator creates — or an adopted orphan zone — makes this a no-op, which is also
    # what makes repeated startups idempotent.
    if db.query(HostedZone).filter(HostedZone.owner_id == demo.id).count() > 0:
        return

    prepared = validated_specs()
    for zone_spec in prepared:
        zone = HostedZone(
            owner_id=demo.id,
            zone_id=generate_zone_id(),
            name=zone_spec["name"],
            type=zone_spec["type"],
            comment=zone_spec["comment"],
        )
        db.add(zone)
        db.commit()
        db.refresh(zone)

        # Reused rather than reimplemented so demo zones carry exactly the apex NS/SOA
        # pair the create-zone endpoint produces.
        seed_default_ns_soa(db, zone)

        for record in zone_spec["records"]:
            db.add(DNSRecord(
                zone_id=zone.id,
                name=record["name"],
                type=record["type"],
                ttl=record["ttl"],
                value=record["value"],
                routing_policy="Simple",
                comment=record["comment"],
            ))
        db.commit()

    logger.info(
        "Seeded %d demo hosted zones with %d records for %s",
        len(prepared),
        sum(len(z["records"]) for z in prepared),
        DEMO_EMAIL,
    )


def seed_demo_content(db: Session) -> None:
    """Entry point for the startup hook. Never raises.

    Both hosts auto-deploy from master, so an exception escaping here would take the
    live API down over cosmetic demo data. The rollback keeps a half-applied unit of
    work out of the session the caller may go on to use.
    """
    try:
        _seed(db)
    except Exception:
        try:
            db.rollback()
        except Exception:
            logger.exception("Rollback after failed demo seeding also failed")
        logger.exception("Demo content seeding failed; starting with an unseeded demo account")
