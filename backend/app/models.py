from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class ZoneType(str, enum.Enum):
    PUBLIC = "Public"
    PRIVATE = "Private"


class RecordType(str, enum.Enum):
    A = "A"
    AAAA = "AAAA"
    CNAME = "CNAME"
    MX = "MX"
    TXT = "TXT"
    PTR = "PTR"
    SRV = "SRV"
    SPF = "SPF"
    NAPTR = "NAPTR"
    CAA = "CAA"
    NS = "NS"
    DS = "DS"
    TLSA = "TLSA"
    SSHFP = "SSHFP"
    HTTPS = "HTTPS"
    SVCB = "SVCB"
    SOA = "SOA"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HostedZone(Base):
    __tablename__ = "hosted_zones"

    id = Column(Integer, primary_key=True, index=True)
    # Owner of the zone — each account only sees its own hosted zones.
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True)
    # e.g. Z1D633PJN98FT9
    zone_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False, index=True)
    type = Column(String, default="Public", nullable=False)
    comment = Column(Text, nullable=True)
    private_zone = Column(String, default="No")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    records = relationship("DNSRecord", back_populates="zone", cascade="all, delete-orphan")
    owner = relationship("User")

    @property
    def record_count(self):
        return len(self.records)


class DNSRecord(Base):
    __tablename__ = "dns_records"

    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(Integer, ForeignKey("hosted_zones.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    ttl = Column(Integer, nullable=True, default=300)
    value = Column(Text, nullable=False)       # newline-separated for multi-value
    routing_policy = Column(String, default="Simple")
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    zone = relationship("HostedZone", back_populates="records")