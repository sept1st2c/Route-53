"""Route-layer tests for /zones/{zone_id}/records.

These cover the rules that can only be enforced in the route layer, because each one
needs either the hosted-zone row or a query over the zone's other records — things a
pydantic schema can't see:

  * the Route 53-managed apex NS/SOA records are read-only (PUT as well as DELETE)
  * a record's value is validated on update, against the *stored* type
  * CNAME placement and exclusivity
      https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/ResourceRecordTypes.html#CNAMEFormat
  * one record set per (zone, name, type)
      https://docs.aws.amazon.com/Route53/latest/APIReference/API_ChangeResourceRecordSets.html

Everything runs against a throwaway SQLite file via a `get_db` dependency override, so
backend/route53.db is never opened.
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import get_db
from app.routes import auth, records, zones
from app.routes.records import PROTECTED_DELETE_ERROR, PROTECTED_UPDATE_ERROR

APEX = "example.com."


@pytest.fixture()
def client(tmp_path):
    """An authenticated client wired to an empty database of its own."""
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    models.Base.metadata.create_all(bind=engine)

    # Only the routers, not app.main — importing that would run create_all against the
    # real database and seed the demo user into it.
    api = FastAPI()
    api.include_router(auth.router, prefix="/api")
    api.include_router(zones.router, prefix="/api")
    api.include_router(records.router, prefix="/api")

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    api.dependency_overrides[get_db] = override_get_db

    with TestClient(api) as c:
        signup = c.post(
            "/api/auth/register",
            json={"email": "tester@example.com", "password": "Passw0rd!", "full_name": "Tester"},
        )
        assert signup.status_code == 201, signup.text
        c.headers["Authorization"] = f"Bearer {signup.json()['access_token']}"
        yield c

    engine.dispose()


@pytest.fixture()
def zone_id(client):
    """A public hosted zone, which Route 53 seeds with its apex NS and SOA records."""
    created = client.post("/api/zones", json={"name": "example.com", "type": "Public"})
    assert created.status_code == 201, created.text
    return created.json()["id"]


# ─── helpers ──────────────────────────────────────────────────────────────────

def add(client, zone_id, **overrides):
    """POST a record, defaulting to a valid A record."""
    payload = {"name": f"www.{APEX}", "type": "A", "value": "192.0.2.1", "ttl": 300}
    payload.update(overrides)
    return client.post(f"/api/zones/{zone_id}/records", json=payload)


def add_ok(client, zone_id, **overrides):
    response = add(client, zone_id, **overrides)
    assert response.status_code == 201, response.text
    return response.json()


def listed(client, zone_id, **params):
    response = client.get(f"/api/zones/{zone_id}/records", params=params)
    assert response.status_code == 200, response.text
    return response.json()["items"]


def find(client, zone_id, rtype, name=APEX):
    return next(r for r in listed(client, zone_id) if r["type"] == rtype and r["name"] == name)


def detail(response):
    return response.json()["detail"]


# ─── item 1: the apex NS and SOA records are read-only ────────────────────────

@pytest.mark.parametrize("rtype", ["NS", "SOA"])
def test_put_cannot_modify_apex_ns_or_soa(client, zone_id, rtype):
    managed = find(client, zone_id, rtype)

    response = client.put(
        f"/api/zones/{zone_id}/records/{managed['id']}",
        json={"name": f"hijacked.{APEX}", "value": "192.0.2.99", "ttl": 60},
    )

    assert response.status_code == 409
    assert detail(response) == PROTECTED_UPDATE_ERROR
    # and nothing was written
    assert find(client, zone_id, rtype) == managed


@pytest.mark.parametrize("rtype", ["NS", "SOA"])
def test_delete_still_refuses_apex_ns_and_soa(client, zone_id, rtype):
    managed = find(client, zone_id, rtype)

    response = client.delete(f"/api/zones/{zone_id}/records/{managed['id']}")

    assert response.status_code == 409
    assert detail(response) == PROTECTED_DELETE_ERROR


def test_bulk_delete_refuses_a_selection_containing_the_apex_ns(client, zone_id):
    ordinary = add_ok(client, zone_id)
    managed = find(client, zone_id, "NS")

    response = client.delete(
        f"/api/zones/{zone_id}/records",
        params={"ids": f"{ordinary['id']},{managed['id']}"},
    )

    assert response.status_code == 409
    assert detail(response) == PROTECTED_DELETE_ERROR
    # the whole selection is refused, so the ordinary record survives too
    assert len(listed(client, zone_id)) == 3


def test_put_still_edits_an_ordinary_record(client, zone_id):
    record = add_ok(client, zone_id)

    response = client.put(
        f"/api/zones/{zone_id}/records/{record['id']}",
        json={"value": "192.0.2.2", "ttl": 60, "comment": "edited"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["value"] == "192.0.2.2"
    assert response.json()["ttl"] == 60


# ─── item 2: value is validated on update, against the stored type ────────────

def test_put_rejects_a_value_that_is_invalid_for_the_stored_type(client, zone_id):
    record = add_ok(client, zone_id)

    response = client.put(f"/api/zones/{zone_id}/records/{record['id']}", json={"value": "not-an-ip"})

    assert response.status_code == 422
    assert "IPv4" in detail(response)
    # the stored value is untouched
    assert listed(client, zone_id, type="A")[0]["value"] == "192.0.2.1"


def test_put_uses_the_stored_type_not_the_payload(client, zone_id):
    """RecordUpdate has no `type`, so an MX record must still be validated as MX."""
    record = add_ok(client, zone_id, name=f"mail.{APEX}", type="MX", value="10 mail.example.com")

    rejected = client.put(f"/api/zones/{zone_id}/records/{record['id']}", json={"value": "192.0.2.1"})
    assert rejected.status_code == 422

    accepted = client.put(
        f"/api/zones/{zone_id}/records/{record['id']}", json={"value": "20 backup.example.com"}
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["value"] == "20 backup.example.com"


def test_put_normalises_the_value_it_stores(client, zone_id):
    record = add_ok(client, zone_id)

    response = client.put(
        f"/api/zones/{zone_id}/records/{record['id']}",
        json={"value": "  192.0.2.7  \n\n"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["value"] == "192.0.2.7"


def test_put_rejects_an_ns_wildcard_rename(client, zone_id):
    """RecordUpdate normalises the name without a type, so the route re-applies the rule."""
    record = add_ok(client, zone_id, name=f"sub.{APEX}", type="NS", value="ns-1.example.com")

    response = client.put(f"/api/zones/{zone_id}/records/{record['id']}", json={"name": f"*.{APEX}"})

    assert response.status_code == 422
    assert "wildcard" in detail(response)


class TestAliasValueOnUpdate:
    """An alias record has no TTL, so its value is an endpoint name rather than rdata."""

    @staticmethod
    def alias(client, zone_id):
        return add_ok(
            client,
            zone_id,
            name=f"alias.{APEX}",
            type="A",
            ttl=None,
            value="dualstack.my-lb-1234.us-east-1.elb.amazonaws.com",
        )

    def test_alias_record_is_created_without_a_ttl(self, client, zone_id):
        assert self.alias(client, zone_id)["ttl"] is None

    def test_omitted_ttl_keeps_validating_as_an_alias_target(self, client, zone_id):
        record = self.alias(client, zone_id)

        response = client.put(
            f"/api/zones/{zone_id}/records/{record['id']}",
            json={"value": "dualstack.other-lb.eu-west-1.elb.amazonaws.com"},
        )

        assert response.status_code == 200, response.text
        assert response.json()["ttl"] is None

    def test_an_invalid_alias_target_is_rejected(self, client, zone_id):
        record = self.alias(client, zone_id)

        response = client.put(
            f"/api/zones/{zone_id}/records/{record['id']}", json={"value": "not a dns name!"}
        )

        assert response.status_code == 422
        assert "alias target" in detail(response)

    def test_supplying_a_ttl_switches_validation_to_the_type(self, client, zone_id):
        """The TTL in the same request decides which rules apply to the new value."""
        record = self.alias(client, zone_id)

        response = client.put(
            f"/api/zones/{zone_id}/records/{record['id']}",
            json={"ttl": 300, "value": "192.0.2.20"},
        )

        assert response.status_code == 200, response.text
        assert response.json()["ttl"] == 300
        assert response.json()["value"] == "192.0.2.20"

    def test_a_ttl_cannot_rescue_an_endpoint_name(self, client, zone_id):
        record = self.alias(client, zone_id)

        response = client.put(
            f"/api/zones/{zone_id}/records/{record['id']}",
            json={"ttl": 300, "value": "dualstack.my-lb-1234.us-east-1.elb.amazonaws.com"},
        )

        assert response.status_code == 422


# ─── item 3: CNAME placement and exclusivity ──────────────────────────────────

def test_cname_at_the_zone_apex_is_rejected(client, zone_id):
    response = add(client, zone_id, name="example.com", type="CNAME", value="target.example.net")

    assert response.status_code == 409
    assert "zone apex" in detail(response)


def test_a_cname_blocks_any_other_record_with_the_same_name(client, zone_id):
    add_ok(client, zone_id, name=f"www.{APEX}", type="CNAME", value="target.example.net")

    response = add(client, zone_id, name=f"www.{APEX}", type="A", value="192.0.2.1")

    assert response.status_code == 409
    assert "CNAME" in detail(response)


def test_an_existing_record_blocks_a_cname_with_the_same_name(client, zone_id):
    add_ok(client, zone_id, name=f"api.{APEX}", type="A", value="192.0.2.1")

    response = add(client, zone_id, name=f"api.{APEX}", type="CNAME", value="target.example.net")

    assert response.status_code == 409
    assert "already has a A record" in detail(response)


def test_a_second_cname_with_the_same_name_is_rejected(client, zone_id):
    add_ok(client, zone_id, name=f"www.{APEX}", type="CNAME", value="one.example.net")

    response = add(client, zone_id, name=f"www.{APEX}", type="CNAME", value="two.example.net")

    assert response.status_code == 409
    assert detail(response) == f"A CNAME record for 'www.{APEX}' already exists."


def test_renaming_a_record_onto_a_cname_is_rejected(client, zone_id):
    add_ok(client, zone_id, name=f"www.{APEX}", type="CNAME", value="target.example.net")
    other = add_ok(client, zone_id, name=f"api.{APEX}", type="A", value="192.0.2.1")

    response = client.put(
        f"/api/zones/{zone_id}/records/{other['id']}", json={"name": f"www.{APEX}"}
    )

    assert response.status_code == 409
    assert "CNAME" in detail(response)


def test_renaming_a_cname_onto_the_apex_is_rejected(client, zone_id):
    cname = add_ok(client, zone_id, name=f"www.{APEX}", type="CNAME", value="target.example.net")

    response = client.put(
        f"/api/zones/{zone_id}/records/{cname['id']}", json={"name": "example.com"}
    )

    assert response.status_code == 409
    assert "zone apex" in detail(response)


def test_renaming_a_cname_onto_a_free_name_is_allowed(client, zone_id):
    cname = add_ok(client, zone_id, name=f"www.{APEX}", type="CNAME", value="target.example.net")

    response = client.put(
        f"/api/zones/{zone_id}/records/{cname['id']}", json={"name": f"shop.{APEX}"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["name"] == f"shop.{APEX}"


# ─── item 4: one record set per (zone, name, type) ────────────────────────────

def test_duplicate_name_and_type_is_rejected(client, zone_id):
    add_ok(client, zone_id)

    response = add(client, zone_id, value="192.0.2.2")

    assert response.status_code == 409
    assert detail(response) == f"A A record for 'www.{APEX}' already exists."


def test_duplicate_is_detected_across_name_spellings(client, zone_id):
    """Names are normalised before the query, so these are the same record set."""
    add_ok(client, zone_id, name="www.example.com")

    response = add(client, zone_id, name="WWW.Example.Com.", value="192.0.2.2")

    assert response.status_code == 409


def test_same_name_with_a_different_type_is_allowed(client, zone_id):
    add_ok(client, zone_id, name=f"www.{APEX}", type="A", value="192.0.2.1")

    response = add(client, zone_id, name=f"www.{APEX}", type="TXT", value='"hello"')

    assert response.status_code == 201, response.text


def test_a_second_apex_ns_record_is_rejected(client, zone_id):
    """The zone already has its seeded apex NS set."""
    response = add(client, zone_id, name="example.com", type="NS", value="ns-9.example.com")

    assert response.status_code == 409
    assert detail(response) == f"A NS record for '{APEX}' already exists."


def test_the_same_name_and_type_in_another_zone_is_allowed(client, zone_id):
    add_ok(client, zone_id)
    other = client.post("/api/zones", json={"name": "example.net", "type": "Public"})
    assert other.status_code == 201, other.text

    response = client.post(
        f"/api/zones/{other.json()['id']}/records",
        json={"name": "www.example.net", "type": "A", "value": "192.0.2.1", "ttl": 300},
    )

    assert response.status_code == 201, response.text


def test_renaming_onto_an_existing_record_set_is_rejected(client, zone_id):
    add_ok(client, zone_id, name=f"www.{APEX}", type="A", value="192.0.2.1")
    second = add_ok(client, zone_id, name=f"api.{APEX}", type="A", value="192.0.2.2")

    response = client.put(
        f"/api/zones/{zone_id}/records/{second['id']}", json={"name": f"www.{APEX}"}
    )

    assert response.status_code == 409
    assert detail(response) == f"A A record for 'www.{APEX}' already exists."


def test_a_record_does_not_conflict_with_itself(client, zone_id):
    """The conflict query excludes the row being updated, so a no-op rename is fine."""
    record = add_ok(client, zone_id, name=f"www.{APEX}", type="A", value="192.0.2.1")

    response = client.put(
        f"/api/zones/{zone_id}/records/{record['id']}",
        json={"name": "www.example.com", "value": "192.0.2.3"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["name"] == f"www.{APEX}"
    assert response.json()["value"] == "192.0.2.3"


# ─── item 5: import validates each line instead of trusting the parser ────────

def test_import_stores_only_valid_records_and_reports_the_rest(client, zone_id):
    zone_file = "\n".join(
        [
            "$ORIGIN example.com.",
            "$TTL 300",
            "good    300 IN A   192.0.2.10",
            "bad     300 IN A   999.999.999.999",
            "text    300 IN TXT \"hello\"",
        ]
    )

    response = client.post(f"/api/zones/{zone_id}/records/import", json={"zone_file": zone_file})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created"] == 2
    assert body["skipped"] >= 1
    assert any("999.999.999.999" in e or "bad.example.com." in e for e in body["errors"])

    stored = {r["name"] for r in listed(client, zone_id)}
    assert f"good.{APEX}" in stored
    assert f"bad.{APEX}" not in stored


def test_import_still_accepts_a_realistic_zone_file(client, zone_id):
    zone_file = "\n".join(
        [
            "$ORIGIN example.com.",
            "$TTL 300",
            "www     300 IN A     192.0.2.10",
            "api     300 IN A     192.0.2.11",
            "api     300 IN A     192.0.2.12",
            "mail    300 IN MX    10 mail.example.com.",
            "spf     300 IN TXT   \"v=spf1 -all\"",
            "svc     300 IN SRV   10 5 80 host.example.com.",
        ]
    )

    response = client.post(f"/api/zones/{zone_id}/records/import", json={"zone_file": zone_file})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["errors"] == []
    assert body["created"] == 5  # the two api lines merge into one record set
    assert find(client, zone_id, "A", f"api.{APEX}")["value"] == "192.0.2.11\n192.0.2.12"
