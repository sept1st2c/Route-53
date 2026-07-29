# 10 — Deployment & Testing

Two topics that get asked together because they're both "did you finish it, or did you
just make it work on your laptop?"

---

# PART 1 — DEPLOYMENT

## The shape of it

```
        Browser
           │
           │  https://route-53.vercel.app
           ▼
   ┌────────────────┐
   │  VERCEL        │   Next.js frontend
   │  (static +     │   Built from frontend/, auto-deploys on push to master
   │   Node runtime)│
   └───────┬────────┘
           │  https://route53-clone-api-zgy9.onrender.com/api/...
           │  JSON + a cross-site cookie
           ▼
   ┌────────────────┐
   │  RENDER        │   FastAPI backend on uvicorn
   │  free plan     │   Built from backend/ via render.yaml
   │                │   SQLite file lives on an EPHEMERAL disk
   └────────────────┘
```

**Two hosts, two domains.** That one fact drives most of the configuration below —
`vercel.app` and `onrender.com` are different origins, so both CORS and cookies need
explicit cross-site handling that a same-origin app never needs.

| | |
| --- | --- |
| Console | https://route-53.vercel.app |
| API | https://route53-clone-api-zgy9.onrender.com |
| Interactive API docs | https://route53-clone-api-zgy9.onrender.com/api/docs |
| Demo login | `demo@route53.aws` / `Demo1234!` |

---

## Why Vercel for the frontend

Vercel is built by the team that builds Next.js, so it's the reference environment:
push to `master`, it detects Next.js, builds and deploys. No config file needed. The only
setting is one environment variable pointing at the API.

```
NEXT_PUBLIC_API_URL = https://route53-clone-api-zgy9.onrender.com
```

**The `NEXT_PUBLIC_` prefix matters.** Next.js inlines those variables into the JavaScript
bundle at build time, which makes them readable by anyone who opens devtools. That's fine
for an API URL and *never* fine for a secret. Variables without the prefix stay
server-side only.

> **MERN analogy:** exactly `REACT_APP_` in Create React App, or `VITE_` in Vite. Same
> rule, same trap.

Because it's baked in at build time, changing it requires a **redeploy**, not a restart.

---

## Why Render for the backend

The requirement was "least steps, and it must stay up for evaluators." Render's free
plan gives a public HTTPS URL with no card and no CLI.

The whole deployment is one file — `render.yaml`, a **Blueprint**. In the Render
dashboard: New → Blueprint → pick the repo → Apply. Nothing is typed into a form.

```yaml
services:
  - type: web
    name: route53-clone-api
    runtime: python
    plan: free
    rootDir: backend                                    # ← monorepo: build only this folder
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /api/health
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.9
      - key: SECRET_KEY
        generateValue: true                             # ← Render generates it; nobody sees it
      - key: ALGORITHM
        value: HS256
      - key: ACCESS_TOKEN_EXPIRE_MINUTES
        value: 1440
      - key: ENVIRONMENT
        value: production
      - key: ALLOWED_ORIGINS
        sync: false                                     # ← set by hand, per environment
```

Three lines worth explaining, because each answers a real question:

| Line | Why |
| --- | --- |
| `rootDir: backend` | It's a monorepo. Without this, Render tries to build the whole repo and finds a `package.json` too. |
| `generateValue: true` | Render generates a random `SECRET_KEY` at provision time. It never exists in the repo, in a chat, or on anyone's screen — the *correct* answer to "how do you handle secrets." |
| `sync: false` | "This one must be set manually." The frontend URL isn't known until Vercel has deployed, and it differs per environment, so it deliberately isn't in version control. |

`--host 0.0.0.0` binds to every interface. The default `127.0.0.1` only accepts
connections from inside the container, so the platform's router could never reach it.
`$PORT` is assigned by Render — hardcoding 8000 fails.

`healthCheckPath: /api/health` points at a real endpoint (`main.py:81`) that returns
`{"status": "ok"}`. Render polls it to decide whether a deploy succeeded.

---

## The two free-tier constraints, and what we did about them

### 1. Cold starts (~40 seconds)

Free services idle out after ~15 minutes of no traffic. The next request wakes the
container, and that first request waits for the whole boot.

**We did not hide this** — the README states it plainly, so an evaluator hitting a slow
first load knows it's the hosting tier and not a broken app. Being upfront about a known
limitation beats being caught by it.

The fixes if it mattered: a paid always-on plan, or a cron job pinging `/api/health`
every 10 minutes. We didn't add the ping because on a free plan that's using the platform
against its own terms, and the honest README costs nothing.

### 2. Ephemeral filesystem — this is the interesting one

The container's disk **does not persist**. Redeploy or wake from idle, and the filesystem
resets to whatever the build produced. SQLite is a file on that disk.

**So the database is destroyed on every deploy and every wake.**

For a normal app that's fatal. For a demo it's survivable, but only if a fresh database
still looks populated — otherwise an evaluator arrives at an empty console.

**The solution: seed on startup.** `main.py:67-77`:

```python
@app.on_event("startup")
def on_startup():
    run_migrations()
    db = SessionLocal()
    try:
        seed_demo_user(db)
        adopt_orphan_zones(db)
        # Last, so adopted orphan zones count as existing content and suppress seeding.
        seed_demo_content(db)
    finally:
        db.close()
```

`seed_demo_content()` (`backend/app/services/demo_seed.py`) creates 3 hosted zones and
their records for the demo account. Two properties make it safe to run on **every** boot:

- **It's idempotent.** It seeds only if the demo user has zero zones. Boot it fifty times,
  you get one copy.
- **It can't take the app down.** It swallows its own exceptions. A seeding failure is
  cosmetic; an API that won't start is not. A startup hook that can raise turns a nice-to-have
  into a single point of failure.

Twenty-six of the 226 tests exist purely to pin those properties, because this code runs
unattended on every production boot and nobody is watching it.

`render.yaml:7-10` documents the real fix for anyone continuing the project:

```
# NOTE: the free plan has an ephemeral filesystem, so the SQLite file is recreated
# on every deploy or wake-from-idle. Startup seeding is what keeps the demo looking
# populated. For durable storage, move to a paid plan and attach a disk mounted at
# /data, then set DATABASE_URL=sqlite:////data/route53.db (four slashes).
```

*(Four slashes because `sqlite:///` + `/data/...` — three for the scheme, one for the
absolute path. A classic off-by-one.)*

---

## Cross-domain: the two things that break when you split hosts

This is the part that bites everyone the first time, and it's a very common interview
question.

### CORS — may the browser *read* the response?

Browsers block a page on origin A from reading a response from origin B unless B says
it's allowed. `backend/app/main.py:44-58`:

```python
_default_origins = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001"
allowed_origins = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)
```

Three details:

- **Localhost works by default**, so a fresh clone runs with no configuration. Production
  overrides via `ALLOWED_ORIGINS`.
- **`allow_credentials=True` forbids `allow_origins=["*"]`.** The spec disallows the
  combination — a wildcard plus credentials would let *any* site make authenticated
  requests on the user's behalf. So the origins must be listed exactly.
- **`expose_headers=["Content-Disposition"]`.** By default JavaScript can only read a
  handful of response headers. The zone-export endpoint puts the filename in
  `Content-Disposition`, so without this line the download works but arrives with the
  wrong name. Easy to miss because nothing errors.

### Cookies — will the browser *send* it?

The JWT lives in an httpOnly cookie. Same-site cookies "just work"; cross-site ones don't.
`backend/app/routes/auth.py:42-48`:

```python
response.set_cookie(
    ...
    httponly=True,
    max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    samesite="none" if IS_PRODUCTION else "lax",
    secure=IS_PRODUCTION,
)
```

with `IS_PRODUCTION = os.getenv("ENVIRONMENT", "development") == "production"` (`auth.py:23`).

| Attribute | Local | Production | Why |
| --- | --- | --- | --- |
| `httponly` | ✅ | ✅ | JavaScript cannot read it → an XSS bug can't steal the token |
| `samesite` | `lax` | `none` | `lax` blocks the cookie on cross-site requests. `vercel.app` → `onrender.com` *is* cross-site, so production needs `none`. |
| `secure` | ❌ | ✅ | **`SameSite=None` is rejected by browsers unless `Secure` is also set.** They come as a pair. |

The local branch exists because `Secure` requires HTTPS, and `http://localhost:3000` isn't.
Forcing `Secure` in dev means the cookie is silently dropped and you spend an hour
wondering why login "succeeds" but every subsequent request 401s.

> **Interview-ready summary:** cross-domain auth needs **three** things aligned —
> `allow_credentials` on the server, `withCredentials` on the client, and
> `SameSite=None; Secure` on the cookie. Miss any one and it fails, usually silently.

---

## Deployment order (it isn't arbitrary)

1. **Backend first**, with `ALLOWED_ORIGINS` unset or provisional. You need its URL.
2. **Frontend**, with `NEXT_PUBLIC_API_URL` = the backend URL.
3. **Back to the backend**, set `ALLOWED_ORIGINS` = the Vercel URL, redeploy.

A circular dependency: each needs the other's URL. You break it by deploying one with the
value missing and filling it in afterwards.

---

## If they ask… (deployment)

**"Why not Docker?"**
Both platforms build from source with zero config for this stack, and the assignment was
scoped to a demo. A container would be the right call the moment the environment gets
non-trivial — a system library, a specific Python patch version, an identical local/CI/prod
runtime.

**"How do you handle secrets?"**
Never in the repo. `.env` is gitignored, `.env.example` documents the *keys* with dummy
values, and production `SECRET_KEY` is generated by Render (`generateValue: true`) so it
exists only in the platform's store. This project also had a real leak early on and the
secret was rotated — see [07-bugs-and-debugging.md](07-bugs-and-debugging.md#bug-7).

**"How would you make it production-grade?"**
Postgres instead of SQLite; Alembic instead of the hand-rolled `ALTER TABLE`; a paid plan
to kill cold starts; refresh tokens so sessions don't expire hard at 24 hours; rate
limiting on `/login`; structured logging and error tracking; CI running `pytest` and
`tsc --noEmit` before deploy.

**"What breaks at scale?"**
SQLite's single-writer lock, first and hardest. Then the `record_count` N+1 on the zone
list. Then the fact that a single container has no horizontal scaling — which SQLite
prevents anyway, since two containers can't share one file.

---

# PART 2 — TESTING

## What exists

**226 backend tests, pytest, all passing.** No frontend test suite — the UI was verified
by driving a real browser with Playwright. Say both halves of that sentence; the gap is
obvious to an interviewer and owning it beats being caught by it.

```
backend/tests/
├── test_schemas.py          48 tests   Validation rules
├── test_demo_seed.py        26 tests   Startup seeding safety
├── test_records_routes.py   24 tests   Route-layer business rules
└── test_bind_parser.py       8 tests   Zone-file parsing
                            ───────────
                            226 collected  (parametrised cases expand the 106 functions)
```

The counts don't add up to 226 because pytest's `@pytest.mark.parametrize` turns one
function into many cases — a single validation test runs once per record type.

Run them:

```bash
cd backend
./venv/Scripts/python.exe -m pytest -q          # Windows
python -m pytest -q                             # macOS / Linux
```

---

## The fixture strategy — the part worth explaining

Every test runs against a **throwaway SQLite file in a pytest temp directory.** The real
`backend/route53.db` is never opened.

`tests/test_records_routes.py:31-60`:

```python
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
```

Four decisions in twenty lines:

**`tmp_path`** — a pytest built-in fixture giving each test its own directory, cleaned up
automatically. Tests can't contaminate each other, and they can run in any order.

**`dependency_overrides[get_db]`** — FastAPI's built-in seam for exactly this. Production
code calls `Depends(get_db)`; tests swap the implementation without the routes knowing.
This is *why* dependency injection is worth the ceremony: testability isn't bolted on,
it's the same mechanism the framework already uses.

> **MERN analogy:** this is `mongodb-memory-server` plus `jest.mock()`, except it's a
> first-class framework feature rather than a library you reach for.

**Assembling a bare `FastAPI()` instead of importing `app.main`** — and the comment says
why. `app.main` runs `create_all()` and the startup seeding **at import time**, against
the real database. Importing it in a test would mutate `backend/route53.db`. Building an
app out of just the routers sidesteps that entirely. This is a real trap: module-level
side effects make a module unimportable in tests.

**`StaticPool`** — forces every connection to reuse the same underlying SQLite connection,
so the test and the app see the same data.

---

## What each file actually covers

### `test_schemas.py` — 48 tests, the largest group

Pure validation, no HTTP, no database. Fast and precise.

Its docstring states the source of truth:

```
The rdata samples are the examples AWS publishes in ResourceRecordTypes.html, so a
failure here means the API diverged from the documented format — and from
frontend/src/lib/dnsValidation.ts, which the console form validates against.
```

That's a strong detail to quote. **The test data isn't invented — it's AWS's own published
examples.** So the suite doesn't test "does the code do what I wrote," it tests "does the
code match the spec."

Covers: per-type value rules (A → IPv4, AAAA → IPv6, MX → priority + host, SRV → four
fields, CAA → flags/tag/value), name normalisation (case, trailing dot), TTL bounds,
routing-policy values, and the alias branch from
[Bug 3](07-bugs-and-debugging.md#bug-3).

### `test_records_routes.py` — 24 tests

The rules a schema **cannot** enforce, because each needs another row from the database:

- the apex `NS`/`SOA` records Route 53 manages are read-only — on `PUT` as well as `DELETE`
- a record's value is validated on update against the **stored** type, not a client-supplied one
- CNAME placement (never at the apex) and exclusivity (nothing else at a CNAME's name)
- one record set per `(zone, name, type)`

This is the clearest demonstration of the layered-validation design: schema tests are
fast and isolated, route tests are slower and need a database, and the split is
principled rather than accidental.

### `test_demo_seed.py` — 26 tests

Safety properties of code that runs unattended on every production boot. Its docstring:

```
This code runs on every boot of a deployment whose database is rebuilt from scratch on
each deploy, so the properties worth pinning down are the safety ones: it must not
duplicate, must not touch an account that already has content, must not reach any
account other than the demo one, and must never let an exception escape into the
startup hook.
```

Four properties, and notice that **none of them is "does it produce the right data."**
They're all "can this hurt anything." That's the right instinct for a startup hook: the
failure mode isn't wrong demo data, it's an API that won't boot.

It also cross-validates the seed data through the real validators (`validated_specs`),
so the seeded records are guaranteed to satisfy the same rules the API enforces —
impossible to seed something a user couldn't have created.

### `test_bind_parser.py` — 8 tests

All eight exist because of [Bug 1](07-bugs-and-debugging.md#bug-1). Written *after* the
fix, each pinning one rule of the format. This is what "add a regression test" actually
looks like: not one test that reproduces the bug, but a set that fences the whole area
so the next person can refactor safely.

---

## How the frontend was verified

No Jest, no Testing Library, no Playwright suite in the repo. Instead the UI was driven
through a real browser during development: log in, create a zone, add records of each
type, edit, bulk delete, import a zone file, export both formats, toggle dark mode,
exercise the keyboard shortcuts — and the deployed build was re-verified end to end after
deployment.

**Two honest observations that came out of that**, and both are good interview material:

1. **`is_visible()` is not "the user can see it."** An element covered by another element
   passes that check. Four of my own assertions were wrong for reasons of this class, and
   each was caught by looking at a screenshot or the network log instead of the DOM.
   Full breakdown in [07-bugs-and-debugging.md](07-bugs-and-debugging.md#bug-6).
2. **Manual verification doesn't survive.** It proves the app worked once, on one day. It
   catches nothing on the next change. That's precisely the gap an automated suite fills,
   and it's why the backend has 226 tests and the frontend has zero.

---

## The gaps, stated plainly

| Gap | Why it wasn't done | What I'd add |
| --- | --- | --- |
| No frontend tests | Time went into UI parity | Testing Library for `RecordForm` validation + the auth guard; Playwright for the four CRUD flows |
| No CI | Single-developer project | GitHub Actions running `pytest -q` and `tsc --noEmit` on every push |
| No coverage measurement | Never wired up | `pytest --cov`; I'd expect `schemas.py` high and the route files patchier |
| No load/perf tests | Not in scope | Would immediately expose the `record_count` N+1 and SQLite's write lock |
| Auth itself is thinly tested | Covered incidentally by the route fixture | Direct tests for token expiry, tampered signatures, and cross-tenant 404s |

The last row is the one to volunteer if they ask "what's the weakest part of your
testing?" — auth is the highest-risk area and it has the least direct coverage. Naming
your own weakest spot before they find it is the strongest move available.

---

## If they ask… (testing)

**"What's your testing philosophy?"**
Test the rules, not the plumbing. The 226 tests are concentrated on validation, business
rules and safety properties — things where being wrong is silent. There are no tests
asserting that SQLAlchemy can insert a row, because that's the framework's job.

**"How do you test something that touches the database?"**
Dependency injection. `get_db` is a FastAPI dependency, so tests override it with a
throwaway SQLite file in a temp directory. Real SQL against a real engine, zero risk to
real data, and every test gets a clean database.

**"How much coverage do you have?"**
I don't have a number, and I'd rather say that than guess. What I can tell you is what's
covered — validation, route-layer rules, seeding safety, the parser — and what isn't —
the whole frontend, and auth directly.

**"When do you write a test?"**
Two triggers on this project. After a bug, always — all eight parser tests came from one
bug. And before shipping anything that runs unattended, which is why seeding has 26.

**"Your tests passed but the feature was broken. What happened?"**
Best answer available, and it's true: my assertion checked the DOM when it should have
checked pixels. `is_visible()` returned true for an element that was completely covered
by another element. The lesson is to assert on what the user experiences, not on a proxy
for it — full story in [07-bugs-and-debugging.md](07-bugs-and-debugging.md#bug-6).
