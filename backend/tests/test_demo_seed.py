"""Tests for the startup seeding of the demo account.

This code runs on every boot of a deployment whose database is rebuilt from scratch on
each deploy, so the properties worth pinning down are the safety ones: it must not
duplicate, must not touch an account that already has content, must not reach any
account other than the demo one, and must never let an exception escape into the
startup hook.

Everything runs against a throwaway SQLite file, so backend/route53.db is never opened.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.models import DNSRecord, HostedZone, User
from app.routes.auth import hash_password, seed_demo_user
from app.schemas import normalize_record_name, validate_record_value
from app.services import demo_seed
from app.services.demo_seed import DEMO_EMAIL, DEMO_ZONES, seed_demo_content, validated_specs

EXPECTED_ZONES = len(DEMO_ZONES)
# seed_default_ns_soa adds the apex NS and SOA pair on top of each zone's own records.
DEFAULT_RECORDS_PER_ZONE = 2
EXPECTED_RECORDS = sum(
    len(z["records"]) + DEFAULT_RECORDS_PER_ZONE for z in DEMO_ZONES
)


@pytest.fixture()
def db(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'seed.db'}",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    models.Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def demo_db(db):
    """A database containing the demo account and nothing else, as on a cold start."""
    seed_demo_user(db)
    return db


def demo_user(db):
    return db.query(User).filter(User.email == DEMO_EMAIL).first()


def zones_of(db, user):
    return db.query(HostedZone).filter(HostedZone.owner_id == user.id).all()


def records_of(db, zones):
    ids = [z.id for z in zones]
    return db.query(DNSRecord).filter(DNSRecord.zone_id.in_(ids)).all()


# ─── seeding an empty demo account ────────────────────────────────────────────

def test_seeds_zones_and_records_on_an_empty_database(demo_db):
    seed_demo_content(demo_db)

    zones = zones_of(demo_db, demo_user(demo_db))
    assert len(zones) == EXPECTED_ZONES
    assert len(records_of(demo_db, zones)) == EXPECTED_RECORDS
    assert all(z.records for z in zones)


def test_seeded_zones_get_route53_style_ids_and_comments(demo_db):
    seed_demo_content(demo_db)

    for zone in zones_of(demo_db, demo_user(demo_db)):
        assert zone.zone_id.startswith("Z") and len(zone.zone_id) == 14
        assert zone.comment


def test_at_least_one_seeded_zone_is_private(demo_db):
    seed_demo_content(demo_db)

    types = {z.type for z in zones_of(demo_db, demo_user(demo_db))}
    assert "Private" in types
    assert "Public" in types


def test_seeded_record_types_cover_the_console_spread(demo_db):
    seed_demo_content(demo_db)

    zones = zones_of(demo_db, demo_user(demo_db))
    types = {r.type for r in records_of(demo_db, zones)}
    assert {"A", "AAAA", "CNAME", "MX", "TXT", "CAA", "SRV"} <= types


def test_a_multi_value_record_is_seeded(demo_db):
    seed_demo_content(demo_db)

    zones = zones_of(demo_db, demo_user(demo_db))
    multi = [r for r in records_of(demo_db, zones) if r.type == "A" and "\n" in r.value]
    assert multi


def test_every_zone_keeps_its_default_apex_ns_and_soa(demo_db):
    seed_demo_content(demo_db)

    for zone in zones_of(demo_db, demo_user(demo_db)):
        apex = [r for r in zone.records if r.name == zone.name]
        assert sum(1 for r in apex if r.type == "SOA") == 1
        assert sum(1 for r in apex if r.type == "NS") == 1


def test_seeding_does_not_create_extra_ns_or_soa_records(demo_db):
    seed_demo_content(demo_db)

    zones = zones_of(demo_db, demo_user(demo_db))
    managed = [r for r in records_of(demo_db, zones) if r.type in ("NS", "SOA")]
    assert len(managed) == EXPECTED_ZONES * DEFAULT_RECORDS_PER_ZONE


def test_no_seeded_record_has_a_null_ttl(demo_db):
    """A null TTL marks an alias record in this codebase; none of the demo data is one."""
    seed_demo_content(demo_db)

    zones = zones_of(demo_db, demo_user(demo_db))
    assert all(r.ttl is not None for r in records_of(demo_db, zones))


# ─── idempotency and the "never touch existing content" guarantee ─────────────

def test_running_twice_creates_no_duplicates(demo_db):
    seed_demo_content(demo_db)
    zones_after_first = [(z.zone_id, z.name) for z in zones_of(demo_db, demo_user(demo_db))]

    seed_demo_content(demo_db)

    zones = zones_of(demo_db, demo_user(demo_db))
    assert [(z.zone_id, z.name) for z in zones] == zones_after_first
    assert len(records_of(demo_db, zones)) == EXPECTED_RECORDS


def test_running_many_times_stays_stable(demo_db):
    for _ in range(4):
        seed_demo_content(demo_db)

    zones = zones_of(demo_db, demo_user(demo_db))
    assert len(zones) == EXPECTED_ZONES
    assert len(records_of(demo_db, zones)) == EXPECTED_RECORDS


def test_does_nothing_when_the_demo_account_already_has_a_zone(demo_db):
    user = demo_user(demo_db)
    existing = HostedZone(
        owner_id=user.id, zone_id="ZUSERCREATED01", name="mine.example.org.", type="Public"
    )
    demo_db.add(existing)
    demo_db.commit()

    seed_demo_content(demo_db)

    zones = zones_of(demo_db, user)
    assert [z.zone_id for z in zones] == ["ZUSERCREATED01"]
    assert records_of(demo_db, zones) == []


def test_does_not_modify_records_in_an_existing_zone(demo_db):
    user = demo_user(demo_db)
    zone = HostedZone(
        owner_id=user.id, zone_id="ZUSERCREATED02", name="example.com.", type="Public"
    )
    demo_db.add(zone)
    demo_db.commit()
    demo_db.refresh(zone)
    record = DNSRecord(
        zone_id=zone.id, name="www.example.com.", type="A", ttl=42, value="192.0.2.99"
    )
    demo_db.add(record)
    demo_db.commit()
    record_id = record.id

    seed_demo_content(demo_db)

    survivor = demo_db.query(DNSRecord).filter(DNSRecord.id == record_id).one()
    assert (survivor.ttl, survivor.value) == (42, "192.0.2.99")
    assert demo_db.query(DNSRecord).count() == 1


def test_does_nothing_when_the_demo_user_does_not_exist(db):
    seed_demo_content(db)

    assert db.query(HostedZone).count() == 0
    assert db.query(DNSRecord).count() == 0
    assert db.query(User).count() == 0


def test_never_seeds_another_account(db):
    other = User(
        email="someone@example.org", hashed_password=hash_password("Passw0rd!"), full_name="Other"
    )
    db.add(other)
    db.commit()

    seed_demo_content(db)

    # No demo user yet, so nothing at all should have been created.
    assert db.query(HostedZone).count() == 0

    seed_demo_user(db)
    seed_demo_content(db)

    assert zones_of(db, other) == []
    assert db.query(HostedZone).filter(HostedZone.owner_id != other.id).count() == EXPECTED_ZONES


def test_an_empty_second_account_is_not_seeded(demo_db):
    seed_demo_content(demo_db)
    other = User(
        email="new@example.org", hashed_password=hash_password("Passw0rd!"), full_name="New"
    )
    demo_db.add(other)
    demo_db.commit()

    seed_demo_content(demo_db)

    assert zones_of(demo_db, other) == []


# ─── the seeded data is data the API itself would accept ─────────────────────

@pytest.mark.parametrize(
    "name,rtype,values",
    [
        (name, rtype, values)
        for zone in DEMO_ZONES
        for name, rtype, _ttl, values, _comment in zone["records"]
    ],
    ids=[
        f"{zone['name']}-{name}-{rtype}"
        for zone in DEMO_ZONES
        for name, rtype, _ttl, _values, _comment in zone["records"]
    ],
)
def test_every_spec_record_passes_the_api_validators(name, rtype, values):
    assert normalize_record_name(name, rtype).endswith(".")
    assert validate_record_value(rtype, "\n".join(values))


def test_every_stored_record_round_trips_through_the_validators(demo_db):
    seed_demo_content(demo_db)

    zones = zones_of(demo_db, demo_user(demo_db))
    for record in records_of(demo_db, zones):
        assert normalize_record_name(record.name, record.type) == record.name
        assert validate_record_value(record.type, record.value) == record.value


def test_no_record_set_is_seeded_twice_within_a_zone(demo_db):
    """The API keys a record set by (zone, name, type) and refuses a second CREATE."""
    seed_demo_content(demo_db)

    for zone in zones_of(demo_db, demo_user(demo_db)):
        keys = [(r.name, r.type) for r in zone.records]
        assert len(keys) == len(set(keys))


def test_no_cname_shares_a_name_or_sits_at_the_apex(demo_db):
    seed_demo_content(demo_db)

    for zone in zones_of(demo_db, demo_user(demo_db)):
        for cname in (r for r in zone.records if r.type == "CNAME"):
            assert cname.name != zone.name
            assert [r.name for r in zone.records].count(cname.name) == 1
            assert "\n" not in cname.value


def test_record_names_stay_inside_their_zone(demo_db):
    seed_demo_content(demo_db)

    for zone in zones_of(demo_db, demo_user(demo_db)):
        assert all(r.name.endswith(zone.name) for r in zone.records)


def test_addresses_come_from_the_documentation_ranges():
    """Demo data must never point at a real address: RFC 5737 / RFC 3849 ranges only."""
    allowed = ("192.0.2.", "198.51.100.", "203.0.113.", "2001:db8:")
    for zone in DEMO_ZONES:
        for _name, rtype, _ttl, values, _comment in zone["records"]:
            if rtype in ("A", "AAAA"):
                assert all(v.startswith(allowed) for v in values), (rtype, values)


def test_hostnames_only_reference_example_domains():
    """No real third-party hostname may appear in a CNAME/MX/SRV target."""
    for zone in DEMO_ZONES:
        for _name, rtype, _ttl, values, _comment in zone["records"]:
            if rtype not in ("CNAME", "MX", "SRV"):
                continue
            targets = [v.split()[-1] for v in values]
            assert all(
                t.rstrip(".").endswith(("example.com", "example.net", "example.org"))
                for t in targets
            ), (rtype, targets)


# ─── a seeding failure must not escape into the startup hook ─────────────────

def test_an_internal_failure_does_not_raise(demo_db, monkeypatch):
    def boom(*_args, **_kwargs):
        raise RuntimeError("seed spec is broken")

    monkeypatch.setattr(demo_seed, "validated_specs", boom)

    seed_demo_content(demo_db)  # must not raise

    assert zones_of(demo_db, demo_user(demo_db)) == []


def test_a_failure_midway_leaves_a_usable_session(demo_db, monkeypatch):
    """A partial write must be rolled back so later requests on the session still work."""
    real = demo_seed.seed_default_ns_soa
    calls = {"n": 0}

    def fail_on_second_zone(db, zone):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("boom")
        return real(db, zone)

    monkeypatch.setattr(demo_seed, "seed_default_ns_soa", fail_on_second_zone)

    seed_demo_content(demo_db)  # must not raise

    # The session is still usable, and a later run adds nothing on top of the partial state.
    before = len(zones_of(demo_db, demo_user(demo_db)))
    assert before > 0
    seed_demo_content(demo_db)
    assert len(zones_of(demo_db, demo_user(demo_db))) == before


def test_a_broken_record_spec_writes_nothing(demo_db, monkeypatch):
    """Validation runs before the first INSERT, so a bad value can't half-seed the account."""
    broken = [{
        "name": "broken.example.com.",
        "type": "Public",
        "comment": "bad",
        "records": [("www.broken.example.com.", "A", 300, ["not-an-ip"], "bad value")],
    }]
    monkeypatch.setattr(demo_seed, "DEMO_ZONES", broken)

    seed_demo_content(demo_db)  # must not raise

    assert db_is_empty(demo_db)


def db_is_empty(db):
    return db.query(HostedZone).count() == 0 and db.query(DNSRecord).count() == 0


def test_validated_specs_does_not_touch_the_database(demo_db):
    prepared = validated_specs()

    assert len(prepared) == EXPECTED_ZONES
    assert db_is_empty(demo_db)
