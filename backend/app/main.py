from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.database import engine, SessionLocal
from app import models
from app.models import HostedZone, User
from app.routes import auth, zones, records
from app.routes.auth import seed_demo_user

# Create all tables
models.Base.metadata.create_all(bind=engine)


def run_migrations():
    """Lightweight SQLite migrations for columns added after the DB was first created."""
    with engine.begin() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(hosted_zones)"))]
        if "owner_id" not in cols:
            conn.execute(text("ALTER TABLE hosted_zones ADD COLUMN owner_id INTEGER"))


def adopt_orphan_zones(db):
    """Zones created before ownership existed are assigned to the demo account so they
    don't leak into brand-new accounts (which must start empty)."""
    demo = db.query(User).filter(User.email == "demo@route53.aws").first()
    if not demo:
        return
    orphans = db.query(HostedZone).filter(HostedZone.owner_id.is_(None)).all()
    if orphans:
        for z in orphans:
            z.owner_id = demo.id
        db.commit()

app = FastAPI(
    title="Route53 Clone API",
    description="A functional clone of AWS Route53 — Hosted Zones & DNS Records management",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── ROUTERS ──────────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api")
app.include_router(zones.router, prefix="/api")
app.include_router(records.router, prefix="/api")


# ─── STARTUP ──────────────────────────────────────────────────────────────────
@app.on_event("startup")
def on_startup():
    run_migrations()
    db = SessionLocal()
    try:
        seed_demo_user(db)
        adopt_orphan_zones(db)
    finally:
        db.close()


# ─── HEALTH ───────────────────────────────────────────────────────────────────
@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "service": "route53-clone-api"}


@app.get("/", tags=["root"])
def root():
    return {
        "message": "Route53 Clone API",
        "docs": "/api/docs",
    }