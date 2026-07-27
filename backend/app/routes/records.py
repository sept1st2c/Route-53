from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models import HostedZone, DNSRecord
from app.schemas import (
    RecordCreate,
    RecordUpdate,
    RecordOut,
    RecordListResponse,
    ImportZoneRequest,
    ImportZoneResponse,
)
from app.schemas import (
    VALID_RECORD_TYPES,
    normalize_record_name,
    validate_alias_target,
    validate_record_value,
)
from app.routes.auth import get_current_user
from app.models import User
from app.services.bind_parser import parse_zone_file
import math

router = APIRouter(prefix="/zones/{zone_id}/records", tags=["dns-records"])

PROTECTED_DELETE_ERROR = "The default NS and SOA records cannot be deleted."
PROTECTED_UPDATE_ERROR = "The default NS and SOA records cannot be modified."


def get_zone_or_404(zone_id: int, db: Session, current_user: User) -> HostedZone:
    zone = (
        db.query(HostedZone)
        .filter(HostedZone.id == zone_id, HostedZone.owner_id == current_user.id)
        .first()
    )
    if not zone:
        raise HTTPException(status_code=404, detail="Hosted zone not found")
    return zone


def is_protected_record(record: DNSRecord, zone: HostedZone) -> bool:
    """The default zone-apex NS and SOA records are managed by Route 53 and cannot be changed."""
    if record.type == "SOA":
        return True
    if record.type == "NS" and record.name == zone.name:
        return True
    return False


def validate_value_or_422(record_type: str, value: str, ttl: Optional[int]) -> str:
    """Validate `value` the way RecordCreate does, given the TTL the record ends up with.

    A null TTL is how this clone marks an alias record, whose value is an endpoint's DNS
    name rather than rdata for `record_type`.
    """
    try:
        if ttl is None:
            return validate_alias_target(value)
        return validate_record_value(record_type, value)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


def check_record_set_conflicts(
    db: Session,
    zone: HostedZone,
    name: str,
    record_type: str,
    exclude_id: Optional[int] = None,
) -> None:
    """Enforce the two rules the schema layer can't check, because both need other rows.

    CNAME, per ResourceRecordTypes.html#CNAMEFormat: "The DNS protocol does not allow you
    to create a CNAME record for the top node of a DNS namespace, also known as the zone
    apex" and "if you create a CNAME record for a subdomain, you cannot create any other
    records for that subdomain".

    Uniqueness, per API_ChangeResourceRecordSets: a record *set* is keyed by Name + Type
    (plus SetIdentifier, which only non-simple routing uses and this clone has no column
    for), and CREATE — unlike UPSERT — fails when that set already exists.
    """
    siblings = db.query(DNSRecord).filter(
        DNSRecord.zone_id == zone.id, DNSRecord.name == name
    )
    if exclude_id is not None:
        siblings = siblings.filter(DNSRecord.id != exclude_id)

    if record_type == "CNAME":
        if name == zone.name:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "The DNS protocol doesn't allow a CNAME record at the zone apex "
                    f"({zone.name.rstrip('.')}). Create an alias record instead."
                ),
            )
        existing = siblings.first()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"A CNAME record for '{name}' already exists."
                    if existing.type == "CNAME"
                    else (
                        f"'{name}' already has a {existing.type} record. DNS doesn't allow a "
                        "CNAME to share a name with any other record."
                    )
                ),
            )
        return

    if siblings.filter(DNSRecord.type == "CNAME").first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"'{name}' already has a CNAME record. DNS doesn't allow any other record "
                "to share a name with a CNAME."
            ),
        )
    if siblings.filter(DNSRecord.type == record_type).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A {record_type} record for '{name}' already exists.",
        )


# Columns the record list can be sorted by, keyed by the column's `sortingField`
# in the console table. Anything else falls back to record name.
SORTABLE_RECORD_COLUMNS = {
    "name": DNSRecord.name,
    "type": DNSRecord.type,
    "routing_policy": DNSRecord.routing_policy,
    "value": DNSRecord.value,
    "ttl": DNSRecord.ttl,
}


@router.get("", response_model=RecordListResponse)
def list_records(
    zone_id: int,
    search: str = Query(default=""),
    type: str = Query(default=""),
    routing_policy: str = Query(default="", description="Filter by routing policy"),
    alias: str = Query(default="", description="Filter by 'Alias' or 'Non-alias'"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    sort_by: str = Query(default="name", description="Column to sort by"),
    sort_order: str = Query(default="asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_zone_or_404(zone_id, db, current_user)

    query = db.query(DNSRecord).filter(DNSRecord.zone_id == zone_id)

    if search:
        query = query.filter(
            DNSRecord.name.ilike(f"%{search}%") | DNSRecord.value.ilike(f"%{search}%")
        )

    if type:
        query = query.filter(DNSRecord.type == type.upper())

    if routing_policy:
        query = query.filter(DNSRecord.routing_policy == routing_policy)

    # Alias records carry no TTL — the alias target is stored in `value` instead.
    if alias == "Alias":
        query = query.filter(DNSRecord.ttl.is_(None))
    elif alias == "Non-alias":
        query = query.filter(DNSRecord.ttl.isnot(None))

    total = query.count()
    pages = math.ceil(total / limit) if total > 0 else 1

    sort_column = SORTABLE_RECORD_COLUMNS.get(sort_by, DNSRecord.name)
    ordering = sort_column.asc() if sort_order == "asc" else sort_column.desc()
    # Sorting happens in SQL before paging, so the order holds across every page.
    # Most columns aren't unique within a zone, so id breaks ties for a stable page split.
    records = (
        query.order_by(ordering, DNSRecord.id)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return RecordListResponse(
        items=records,
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


@router.post("", response_model=RecordOut, status_code=status.HTTP_201_CREATED)
def create_record(
    zone_id: int,
    payload: RecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    zone = get_zone_or_404(zone_id, db, current_user)

    # RecordCreate has already validated name, type and value; these rules need the zone.
    check_record_set_conflicts(db, zone, payload.name, payload.type)

    record = DNSRecord(
        zone_id=zone_id,
        name=payload.name,
        type=payload.type,
        ttl=payload.ttl,
        value=payload.value,
        routing_policy=payload.routing_policy,
        comment=payload.comment,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/{record_id}", response_model=RecordOut)
def get_record(
    zone_id: int,
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_zone_or_404(zone_id, db, current_user)
    record = db.query(DNSRecord).filter(
        DNSRecord.id == record_id, DNSRecord.zone_id == zone_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


@router.put("/{record_id}", response_model=RecordOut)
def update_record(
    zone_id: int,
    record_id: int,
    payload: RecordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    zone = get_zone_or_404(zone_id, db, current_user)
    record = db.query(DNSRecord).filter(
        DNSRecord.id == record_id, DNSRecord.zone_id == zone_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    # DELETE already refuses the Route 53-managed apex NS/SOA; renaming or rewriting one
    # is just as destructive, so PUT has to refuse them too.
    if is_protected_record(record, zone):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=PROTECTED_UPDATE_ERROR,
        )

    # RecordUpdate normalises the name without knowing the type, so the NS-wildcard rule
    # is re-run here now that the stored type is available.
    new_name = record.name
    if payload.name is not None:
        try:
            new_name = normalize_record_name(payload.name, record.type)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

    # RecordUpdate can't express "clear the TTL", so an omitted TTL keeps the stored one.
    # The resulting TTL is what decides whether `value` is an alias target or rdata.
    new_ttl = record.ttl if payload.ttl is None else payload.ttl

    new_value = record.value
    if payload.value is not None:
        new_value = validate_value_or_422(record.type, payload.value, new_ttl)

    # A rename moves the record into a different record set, so re-check the set rules.
    if new_name != record.name:
        check_record_set_conflicts(db, zone, new_name, record.type, exclude_id=record.id)

    record.name = new_name
    record.ttl = new_ttl
    record.value = new_value
    if payload.routing_policy is not None:
        record.routing_policy = payload.routing_policy
    if payload.comment is not None:
        record.comment = payload.comment

    db.commit()
    db.refresh(record)
    return record


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_record(
    zone_id: int,
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    zone = get_zone_or_404(zone_id, db, current_user)
    record = db.query(DNSRecord).filter(
        DNSRecord.id == record_id, DNSRecord.zone_id == zone_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    if is_protected_record(record, zone):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=PROTECTED_DELETE_ERROR,
        )

    db.delete(record)
    db.commit()
    return None


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def bulk_delete_records(
    zone_id: int,
    ids: str = Query(..., description="Comma-separated record IDs"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk delete records by comma-separated IDs. e.g. ?ids=1,2,3"""
    zone = get_zone_or_404(zone_id, db, current_user)

    try:
        id_list = [int(i.strip()) for i in ids.split(",")]
    except ValueError:
        raise HTTPException(status_code=400, detail="ids must be comma-separated integers")

    records = db.query(DNSRecord).filter(
        DNSRecord.id.in_(id_list),
        DNSRecord.zone_id == zone_id,
    ).all()

    # Refuse if any selected record is a protected default NS/SOA.
    if any(is_protected_record(r, zone) for r in records):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=PROTECTED_DELETE_ERROR,
        )

    for r in records:
        db.delete(r)
    db.commit()
    return None


@router.post("/import", response_model=ImportZoneResponse)
def import_zone_file(
    zone_id: int,
    payload: ImportZoneRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-create records from a pasted BIND zone file.

    The apex SOA and NS records are managed by Route 53, so any SOA / apex-NS lines
    in the file are skipped. Records sharing a (name, type) are merged into one set;
    an existing set with the same name+type is overwritten.
    """
    zone = get_zone_or_404(zone_id, db, current_user)

    parsed = parse_zone_file(payload.zone_file, default_origin=zone.name)
    errors = list(parsed["errors"])
    created = updated = skipped = 0

    for rec in parsed["records"]:
        name, rtype, ttl, value = rec["name"], rec["type"], rec["ttl"], rec["value"]

        # Skip the Route 53-managed defaults.
        if rtype == "SOA" or (rtype == "NS" and name == zone.name):
            skipped += 1
            continue
        if rtype not in VALID_RECORD_TYPES:
            skipped += 1
            errors.append(f"Skipped unsupported record type {rtype} for {name}")
            continue

        # The parser reads syntax, not Route 53's rules, so run every line through the
        # same validators POST uses. One bad line is skipped and reported; the rest import.
        try:
            name = normalize_record_name(name, rtype)
            value = (
                validate_alias_target(value)
                if ttl is None
                else validate_record_value(rtype, value)
            )
        except ValueError as e:
            skipped += 1
            errors.append(f"Skipped {name} ({rtype}): {e}")
            continue

        existing = (
            db.query(DNSRecord)
            .filter(DNSRecord.zone_id == zone_id, DNSRecord.name == name, DNSRecord.type == rtype)
            .first()
        )
        if existing:
            if is_protected_record(existing, zone):
                skipped += 1
                continue
            existing.value = value
            existing.ttl = ttl
            updated += 1
        else:
            db.add(DNSRecord(
                zone_id=zone_id,
                name=name,
                type=rtype,
                ttl=ttl,
                value=value,
                routing_policy="Simple",
                comment="Imported from zone file",
            ))
            created += 1

    db.commit()
    return ImportZoneResponse(created=created, updated=updated, skipped=skipped, errors=errors)