from pydantic import BaseModel, EmailStr, field_validator
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


class RecordCreate(BaseModel):
    name: str
    type: str
    ttl: Optional[int] = 300
    value: str
    routing_policy: Optional[str] = "Simple"
    comment: Optional[str] = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        v = v.upper()
        if v not in VALID_RECORD_TYPES:
            raise ValueError(f"type must be one of {VALID_RECORD_TYPES}")
        return v


class RecordUpdate(BaseModel):
    name: Optional[str] = None
    ttl: Optional[int] = None
    value: Optional[str] = None
    routing_policy: Optional[str] = None
    comment: Optional[str] = None


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