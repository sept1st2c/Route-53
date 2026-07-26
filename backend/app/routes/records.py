from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
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
from app.schemas import VALID_RECORD_TYPES
from app.routes.auth import get_current_user
from app.models import User
from app.services.bind_parser import parse_zone_file
import math

router = APIRouter(prefix="/zones/{zone_id}/records", tags=["dns-records"])


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
    """The default zone-apex NS and SOA records are managed by Route 53 and cannot be deleted."""
    if record.type == "SOA":
        return True
    if record.type == "NS" and record.name == zone.name:
        return True
    return False


@router.get("", response_model=RecordListResponse)
def list_records(
    zone_id: int,
    search: str = Query(default=""),
    type: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
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

    total = query.count()
    pages = math.ceil(total / limit) if total > 0 else 1
    records = query.order_by(DNSRecord.name, DNSRecord.type).offset((page - 1) * limit).limit(limit).all()

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
    get_zone_or_404(zone_id, db, current_user)

    # CNAME uniqueness check — only one CNAME per name
    if payload.type == "CNAME":
        existing = db.query(DNSRecord).filter(
            DNSRecord.zone_id == zone_id,
            DNSRecord.name == payload.name,
            DNSRecord.type == "CNAME",
        ).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"A CNAME record for '{payload.name}' already exists",
            )

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
    get_zone_or_404(zone_id, db, current_user)
    record = db.query(DNSRecord).filter(
        DNSRecord.id == record_id, DNSRecord.zone_id == zone_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    if payload.name is not None:
        record.name = payload.name
    if payload.ttl is not None:
        record.ttl = payload.ttl
    if payload.value is not None:
        record.value = payload.value
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
            detail="The default NS and SOA records cannot be deleted.",
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
            detail="The default NS and SOA records cannot be deleted.",
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