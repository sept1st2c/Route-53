from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, select
from app.database import get_db
from app.models import HostedZone, DNSRecord
from app.schemas import ZoneCreate, ZoneUpdate, ZoneOut, ZoneListResponse
from app.routes.auth import get_current_user
from app.models import User
from datetime import datetime, timezone
import random
import string
import math

router = APIRouter(prefix="/zones", tags=["hosted-zones"])


def generate_zone_id() -> str:
    """Generate a Route53-style zone ID like Z1D633PJN98FT9"""
    chars = string.ascii_uppercase + string.digits
    return "Z" + "".join(random.choices(chars, k=13))


def seed_default_ns_soa(db: Session, zone: HostedZone):
    """Add default NS and SOA records like Route53 does on zone creation."""
    ns_record = DNSRecord(
        zone_id=zone.id,
        name=zone.name,
        type="NS",
        ttl=172800,
        value="\n".join([
            "ns-1.awsdns-1.com.",
            "ns-2.awsdns-2.net.",
            "ns-3.awsdns-3.co.uk.",
            "ns-4.awsdns-4.org.",
        ]),
        routing_policy="Simple",
        comment="Default NS record",
    )
    soa_record = DNSRecord(
        zone_id=zone.id,
        name=zone.name,
        type="SOA",
        ttl=900,
        value="ns-1.awsdns-1.com. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400",
        routing_policy="Simple",
        comment="Default SOA record",
    )
    db.add(ns_record)
    db.add(soa_record)
    db.commit()


# Columns the hosted-zone list can be sorted by. `record_count` is a computed
# property rather than a column, so it sorts via a correlated COUNT subquery.
SORTABLE_ZONE_COLUMNS = {
    "name": HostedZone.name,
    "type": HostedZone.type,
    "comment": HostedZone.comment,
    "zone_id": HostedZone.zone_id,
    "created_at": HostedZone.created_at,
}


@router.get("", response_model=ZoneListResponse)
def list_zones(
    search: str = Query(default="", description="Search by zone name"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    type: str = Query(default="", description="Filter by Public or Private"),
    sort_by: str = Query(default="created_at", description="Column to sort by"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(HostedZone).filter(HostedZone.owner_id == current_user.id)

    if search:
        query = query.filter(HostedZone.name.ilike(f"%{search}%"))

    if type in ("Public", "Private"):
        query = query.filter(HostedZone.type == type)

    total = query.count()
    pages = math.ceil(total / limit) if total > 0 else 1

    if sort_by == "record_count":
        sort_column = (
            select(func.count(DNSRecord.id))
            .where(DNSRecord.zone_id == HostedZone.id)
            .correlate(HostedZone)
            .scalar_subquery()
        )
    else:
        sort_column = SORTABLE_ZONE_COLUMNS.get(sort_by, HostedZone.created_at)

    ordering = sort_column.asc() if sort_order == "asc" else sort_column.desc()
    zones = query.order_by(ordering).offset((page - 1) * limit).limit(limit).all()

    return ZoneListResponse(
        items=[ZoneOut.from_orm_with_count(z) for z in zones],
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


@router.post("", response_model=ZoneOut, status_code=status.HTTP_201_CREATED)
def create_zone(
    payload: ZoneCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (
        db.query(HostedZone)
        .filter(HostedZone.name == payload.name, HostedZone.owner_id == current_user.id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Hosted zone '{payload.name}' already exists",
        )

    zone = HostedZone(
        owner_id=current_user.id,
        zone_id=generate_zone_id(),
        name=payload.name,
        type=payload.type,
        comment=payload.comment,
    )
    db.add(zone)
    db.commit()
    db.refresh(zone)

    seed_default_ns_soa(db, zone)
    db.refresh(zone)

    return ZoneOut.from_orm_with_count(zone)


@router.get("/{zone_id}", response_model=ZoneOut)
def get_zone(
    zone_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    zone = (
        db.query(HostedZone)
        .filter(HostedZone.id == zone_id, HostedZone.owner_id == current_user.id)
        .first()
    )
    if not zone:
        raise HTTPException(status_code=404, detail="Hosted zone not found")
    return ZoneOut.from_orm_with_count(zone)


@router.put("/{zone_id}", response_model=ZoneOut)
def update_zone(
    zone_id: int,
    payload: ZoneUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    zone = (
        db.query(HostedZone)
        .filter(HostedZone.id == zone_id, HostedZone.owner_id == current_user.id)
        .first()
    )
    if not zone:
        raise HTTPException(status_code=404, detail="Hosted zone not found")

    if payload.comment is not None:
        zone.comment = payload.comment
    if payload.type is not None:
        if payload.type not in ("Public", "Private"):
            raise HTTPException(status_code=400, detail="type must be Public or Private")
        zone.type = payload.type

    db.commit()
    db.refresh(zone)
    return ZoneOut.from_orm_with_count(zone)


@router.get("/{zone_id}/export")
def export_zone(
    zone_id: int,
    format: str = Query(default="json", pattern="^(json|bind)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a hosted zone's records as JSON or a BIND-style zone file."""
    zone = (
        db.query(HostedZone)
        .filter(HostedZone.id == zone_id, HostedZone.owner_id == current_user.id)
        .first()
    )
    if not zone:
        raise HTTPException(status_code=404, detail="Hosted zone not found")

    records = (
        db.query(DNSRecord)
        .filter(DNSRecord.zone_id == zone_id)
        .order_by(DNSRecord.name, DNSRecord.type)
        .all()
    )
    base_filename = zone.name.rstrip(".")

    if format == "json":
        payload = {
            "hosted_zone": {
                "name": zone.name,
                "type": zone.type,
                "comment": zone.comment,
                "zone_id": zone.zone_id,
            },
            "records": [
                {
                    "name": r.name,
                    "type": r.type,
                    "ttl": r.ttl,
                    "value": r.value.split("\n"),
                    "routing_policy": r.routing_policy,
                    "comment": r.comment,
                }
                for r in records
            ],
            "exported_at": datetime.now(timezone.utc).isoformat(),
        }
        return JSONResponse(
            content=payload,
            headers={"Content-Disposition": f'attachment; filename="{base_filename}.json"'},
        )

    # BIND zone file
    lines = [f"$ORIGIN {zone.name}", "$TTL 300", ""]
    for r in records:
        fqdn = r.name.rstrip(".") + "."
        ttl = r.ttl or 300
        for value in r.value.split("\n"):
            lines.append(f"{fqdn:<32} {ttl:<7} IN {r.type:<6} {value}")
    text = "\n".join(lines) + "\n"
    return PlainTextResponse(
        content=text,
        headers={"Content-Disposition": f'attachment; filename="{base_filename}.txt"'},
    )


@router.delete("/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_zone(
    zone_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    zone = (
        db.query(HostedZone)
        .filter(HostedZone.id == zone_id, HostedZone.owner_id == current_user.id)
        .first()
    )
    if not zone:
        raise HTTPException(status_code=404, detail="Hosted zone not found")

    # Only the default apex NS and SOA records may remain when deleting a zone.
    deletable = [
        r for r in zone.records
        if not (r.type == "SOA" or (r.type == "NS" and r.name == zone.name))
    ]
    if deletable:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Before you can delete a hosted zone, you must delete all "
                "records in it other than the default NS and SOA records."
            ),
        )

    db.delete(zone)
    db.commit()
    return None