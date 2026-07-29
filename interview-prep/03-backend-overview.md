# 03 — Backend Overview: FastAPI for a Node Developer

> ### TL;DR — the 5 things you must be able to say
>
> 1. **FastAPI is Express with validation and docs built in**, not bolted on — you annotate a parameter and the framework validates it before your handler runs.
> 2. **`Depends()` replaces middleware.** It's per-parameter, typed, and overridable in tests — which is how all 226 tests run against a throwaway database.
> 3. **Pydantic is Zod wired into the framework.** TypeScript types vanish at runtime; Pydantic models are real objects that validate and coerce.
> 4. **Validation is split across two layers on purpose** — payload-decidable rules in `schemas.py`, anything needing another row in the route layer. A schema can't run a query.
> 5. **The handlers are sync `def`, not `async def`** — SQLAlchemy's sync API would block the event loop, so FastAPI runs them in a thread pool. Don't claim it's async end to end.
>
> **Read** §0–§5 and §12 (~20 min). **Look up** everything under 🔎 Reference.

> **Who this is for:** you know Express and Node cold. You had never written Python
> before this project. This doc teaches the FastAPI backend by constantly mapping it
> back to things you already know.
>
> Every code snippet below is copied verbatim from the repo with a `file:line`
> reference. Nothing is invented.

---

## 0. The 30-second version (say this in an interview)

> "The backend is a FastAPI service — that's Python's equivalent of Express, but with
> schema validation and OpenAPI docs built into the framework instead of bolted on.
> It's about 19 endpoints over two resources, hosted zones and DNS records, backed by
> SQLite through SQLAlchemy. Auth is JWT in an httpOnly cookie. The interesting design
> decision is that validation is deliberately split across two layers: anything you can
> decide from the request payload alone lives in Pydantic schemas, and anything that
> needs a database lookup lives in the route handlers."

---

## 1. The Express ↔ FastAPI Rosetta Stone

This is the single most useful table in this document. Memorise it.

| FastAPI / Python | Express / Node equivalent | Notes |
|---|---|---|
| `APIRouter(prefix="/zones")` | `express.Router()` + `app.use('/zones', r)` | Prefix is declared on the router itself, not at mount time |
| `app.include_router(zones.router, prefix="/api")` | `app.use('/api', zonesRouter)` | Mounting |
| `Depends(get_db)` | middleware — but *per-handler* and it **returns a value** | The big conceptual jump. See §4 |
| Pydantic `BaseModel` | Joi/Zod schema **+** the TypeScript `interface` **+** the serialiser, all in one object | See §3 |
| `uvicorn app.main:app` | `node server.js` | The process that actually listens |
| ASGI | Express's `(req, res, next)` pipeline, but async-native from the ground up | See §2 |
| auto `/api/docs` | Swagger UI you'd hand-wire with `swagger-jsdoc` + `swagger-ui-express` | Free, always in sync |
| `venv` + `requirements.txt` | `node_modules` + `package.json` | See §9 |
| `raise HTTPException(status_code=409, detail="...")` | `res.status(409).json({error: '...'})` or `next(err)` | Raising, not returning |
| `response_model=ZoneOut` | manually picking fields before `res.json()` | Framework strips anything not in the model |
| SQLAlchemy | Sequelize / TypeORM (it is an ORM + query builder) | Not Mongoose — this is relational |
| `Session` (`db`) | a Sequelize transaction/connection handle | Unit-of-work: you mutate objects, then `db.commit()` |
| `pytest` | Jest / Mocha | |
| `Procfile` → `web: uvicorn ...` | `"start": "node server.js"` in package.json scripts | |

---

## 2. What FastAPI, ASGI and uvicorn actually are

### FastAPI

FastAPI is a Python web framework built on top of **Starlette** (the HTTP/routing layer)
and **Pydantic** (the validation layer). Think of it as:

```
FastAPI  ≈  Express  +  Zod  +  Swagger-autogen  +  a DI container
```

You declare a handler, annotate its parameters with types, and FastAPI does the rest:
parses the request, validates it, injects dependencies, serialises the response, and
publishes an OpenAPI spec describing all of it.

### ASGI (Asynchronous Server Gateway Interface)

**Jargon: ASGI** is a *specification* — a contract between a Python web server and a
Python web application. It says "a web app is an async callable that receives a `scope`
dict, a `receive` channel and a `send` channel."

The Node analogy: Node has no equivalent spec because Node's `http` module *is* the
standard — `(req, res) => {}` is the universal shape. Python needed a written contract
because it has many servers (uvicorn, hypercorn, daphne) and many frameworks (FastAPI,
Django, Starlette) that must interoperate.

ASGI's predecessor was **WSGI**, which was synchronous and one-request-per-thread —
that's what Flask and old Django use. ASGI added async, WebSockets and long-lived
connections. So:

- **WSGI** ≈ blocking Node before promises existed
- **ASGI** ≈ Node's actual event loop model

### uvicorn

**uvicorn is the server process.** It is the literal answer to "what is running?" —
the exact counterpart of `node server.js`.

```
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```
> `backend/Procfile:1`

Read `app.main:app` as *"import the module `app.main`, find the object named `app` in
it, and serve that."* It's `require('./app/main').app`.

`uvicorn[standard]` (`requirements.txt:2`) pulls in the C-accelerated extras
(`uvloop` where available, `httptools`), which is roughly "use the fast native parser
rather than the pure-Python one."

**Interview soundbite:** *"FastAPI is the framework, uvicorn is the server, ASGI is the
interface between them. In Node those three are collapsed into one thing, so people
coming from Express often don't realise they're separate in Python."*

### Sync `def` vs `async def` — and why every endpoint here is sync

FastAPI lets you write a handler either way:

```python
@router.get("/{zone_id}", response_model=ZoneOut)
def get_zone(
    zone_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
```
> `backend/app/routes/zones.py:143-148` — note `def`, not `async def`

**Every endpoint in this codebase is a plain `def`.** That is correct, and here's why:

- Inside a handler we call SQLAlchemy: `db.query(HostedZone)...first()`. The SQLAlchemy
  ORM used here is **synchronous** — it blocks the thread while the driver talks to the
  database.
- If you write `async def` and then perform a blocking call inside it, you block the
  **event loop itself** — every other in-flight request stalls. This is exactly the
  same failure mode as running a synchronous `fs.readFileSync` or a `while` loop inside
  an Express handler: nothing else can make progress.
- FastAPI's rule: **a `def` handler is automatically run in a threadpool**; an
  `async def` handler runs directly on the event loop.

**Jargon: threadpool** — a fixed pool of worker OS threads (Starlette's default is 40).
When FastAPI sees a sync handler it hands the call to
`anyio.to_thread.run_sync`, so the blocking work happens on a worker thread while the
event loop stays free to accept new connections.

```
async def + blocking DB call   →  event loop blocked  →  whole server stalls   ✗
def       + blocking DB call   →  runs on a worker thread, loop free           ✓  ← this codebase
async def + await async driver →  best throughput, needs async SQLAlchemy       (not used here)
```

**The consequence to be honest about:** the threadpool is finite. Under enough
concurrent load, request N+41 waits for a free worker. The fix if this mattered would
be to move to `async def` handlers plus SQLAlchemy's async engine
(`sqlalchemy.ext.asyncio` with `aiosqlite`/`asyncpg`). For this workload — a console UI
with a handful of users — the threadpool is entirely adequate, and the sync ORM keeps
the code far simpler to read.

**Interview soundbite:** *"They're all sync `def` on purpose. SQLAlchemy's ORM is
blocking, so an `async def` handler would block the event loop. Sync handlers get
offloaded to a threadpool automatically, which is the right trade for a blocking
driver. The upgrade path is async SQLAlchemy plus `async def`, and I'd only take it if
I saw threadpool saturation."*

---

## 3. Pydantic — "Zod + TypeScript types + serialisation, in one object"

In your MERN stack you'd typically write three things for one payload:

```ts
// 1. the runtime validator
const ZoneCreate = z.object({ name: z.string(), type: z.string() });
// 2. the compile-time type
type ZoneCreate = z.infer<typeof ZoneCreate>;
// 3. the response shaping, by hand
res.json({ id: z.id, name: z.name });   // remember not to leak password_hash!
```

Pydantic gives you all three from one class:

```python
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
```
> `backend/app/schemas.py:51-62`

What you get for free:

| Capability | How |
|---|---|
| Runtime validation | Wrong types → automatic **422** with a machine-readable error list |
| Static typing | `payload.name` is known to be `str` by the editor/type-checker |
| **Coercion & normalisation** | `"example.com"` is silently rewritten to `"example.com."` |
| Defaults | `type` defaults to `"Public"`, `comment` to `None` |
| Response filtering | `response_model=ZoneOut` — anything not declared is **dropped** |
| OpenAPI schema | Every model becomes a component in `/openapi.json` automatically |

### Three kinds of Pydantic validator, all used here

**1. `Field(...)` constraints** — declarative bounds:

```python
    ttl: Optional[int] = Field(default=300, ge=TTL_MIN, le=TTL_MAX)
```
> `backend/app/schemas.py:589` (with `TTL_MIN = 0`, `TTL_MAX = 2147483647` at `schemas.py:124-125`)

**2. `@field_validator`** — one field, runs after that field is parsed:

```python
    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        v = v.upper()
        if v not in VALID_RECORD_TYPES:
            raise ValueError(f"type must be one of: {', '.join(sorted(VALID_RECORD_TYPES))}")
        return v
```
> `backend/app/schemas.py:594-600`

**3. `@model_validator(mode="after")`** — the whole object, once every field is parsed.
Needed when one field's validity depends on another:

```python
    @model_validator(mode="after")
    def check_name_and_value(self):
        # Runs after field validation so `type` is already normalised to upper case; name and
        # value both need it, and a field validator can't see a later-declared field.
        self.name = normalize_record_name(self.name, self.type)
        # A null TTL is how this clone marks an alias record, whose value is an endpoint name
        # rather than rdata for `type`, so the per-type rules must not be applied to it.
        self.value = (
            validate_alias_target(self.value)
            if self.ttl is None
            else validate_record_value(self.type, self.value)
        )
        return self
```
> `backend/app/schemas.py:607-619`

That last one is the single densest piece of business logic in the schema layer. It
encodes two rules at once:

- `value` can only be checked *after* `type` is uppercased, and *after* `ttl` is known.
- **`ttl IS NULL` is how this codebase marks an alias record.** An alias record's value
  is an AWS endpoint hostname, not type-specific rdata, so the per-type rules must be
  skipped for it. This convention repeats across the whole codebase — see §7.

### `model_config = {"from_attributes": True}`

```python
class RecordOut(BaseModel):
    ...
    model_config = {"from_attributes": True}
```
> `backend/app/schemas.py:641-653`

This is the "read from an ORM object, not a dict" switch (it was called `orm_mode` in
Pydantic v1). It lets a route `return record` where `record` is a SQLAlchemy row, and
FastAPI reads attributes off it to build the response. **This is also your security
boundary for serialisation:** `UserOut` (`schemas.py:40-46`) declares
`id / email / full_name / created_at` and nothing else, so `hashed_password` can never
leak out of `/api/auth/me` even though the ORM object has it.

---

## 4. Dependency Injection — the biggest mental shift from Express

**Jargon: DI (dependency injection)** — instead of a function reaching out and
constructing what it needs, the framework constructs it and hands it in. FastAPI's DI
is declared right in the handler signature.

### The Express way

```js
app.use(attachDb);                       // sets req.db
app.get('/zones', requireAuth, (req, res) => {   // requireAuth sets req.user
  req.db.query(...);
});
```
Middleware mutates `req` by side effect. Nothing in the handler's signature tells you
`req.user` exists — you just have to know.

### The FastAPI way

```python
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
```
> `backend/app/routes/zones.py:66-75`

The signature is the complete contract. It says: *this endpoint takes six query
parameters with these defaults and constraints, needs a DB session, and needs an
authenticated user.* No hidden state.

| | Express middleware | FastAPI `Depends()` |
|---|---|---|
| Scope | Applies to a path prefix or whole app | Per-handler (or per-router, or per-app) |
| Communication | Mutates `req` by side effect | **Returns a value**, bound to a named parameter |
| Visible in signature | No | Yes |
| Appears in Swagger | No | Yes — `Depends` chains contribute their params to the OpenAPI spec |
| Cached | n/a | Yes — same dependency in one request resolves once |

### `get_db` — a dependency with teardown

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```
> `backend/app/database.py:20-25`

The `yield` is the key. Everything before it runs **before** the handler; everything
after runs **after the response is sent**. It's `try/finally` around your handler —
exactly what you'd write manually in Express to guarantee a connection is released:

```
get_db()          →  SessionLocal()  ─┐
                                      │  handler runs with `db`
                                      │  response serialised
                  →  db.close()      ─┘   (always, even if the handler raised)
```

Because the `finally` block always runs, **a connection can never leak**, even on a
500. In Express you'd need `res.on('finish', ...)` or a try/finally in every handler.

### Nested DI — `get_current_user` itself depends on `get_db`

This is the part worth calling out in an interview, because it shows DI is a *graph*,
not a flat list:

```python
def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get("access_token")
```
> `backend/app/routes/auth.py:52-53`

So when a route declares both:

```python
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
```
> `backend/app/routes/zones.py:73-74`

FastAPI resolves the graph and — crucially — **caches by dependency**, so `get_db` is
called **once**, and both the route and `get_current_user` receive the *same* session.
The user lookup and the zone query run on one connection, in one unit of work.

```
        request
           │
           ├─────────────┐
           ▼             ▼
       get_db ◄──── get_current_user      (get_current_user asks for get_db;
           │             │                 FastAPI returns the cached instance)
           ▼             ▼
        db: Session   current_user: User
           └──────┬──────┘
                  ▼
            list_zones(...)
```

**Interview soundbite:** *"`Depends` is middleware that returns a value instead of
mutating the request, and it's declared per-handler so the signature is the whole
contract. Dependencies can depend on each other — `get_current_user` takes `get_db` —
and FastAPI caches per request, so both the auth check and the handler share one DB
session."*

---

## 5. Architecture — the layers and a request's journey

```
                         ┌──────────────────────────────────────────┐
   HTTP request  ───────▶│  uvicorn  (the ASGI server process)      │
                         └───────────────────┬──────────────────────┘
                                             ▼
                         ┌──────────────────────────────────────────┐
                         │  CORSMiddleware       main.py:51-58      │  origin allowed?
                         └───────────────────┬──────────────────────┘
                                             ▼
                         ┌──────────────────────────────────────────┐
                         │  Router match         main.py:61-63      │  /api/zones/... → zones.router
                         └───────────────────┬──────────────────────┘
                                             ▼
                         ┌──────────────────────────────────────────┐
                         │  Dependency graph                        │
                         │    get_db          database.py:20        │  open session
                         │    get_current_user  auth.py:52          │  cookie/Bearer → JWT → User
                         └───────────────────┬──────────────────────┘   401 if bad
                                             ▼
                         ┌──────────────────────────────────────────┐
                         │  Pydantic request model   schemas.py     │  LAYER 1 VALIDATION
                         │    RecordCreate / ZoneCreate             │  422 if bad
                         └───────────────────┬──────────────────────┘
                                             ▼
                         ┌──────────────────────────────────────────┐
                         │  Route handler        routes/*.py        │  LAYER 2 VALIDATION
                         │    owner check → 404                     │  (needs the database)
                         │    check_record_set_conflicts → 409      │
                         │    is_protected_record       → 409       │
                         └───────────────────┬──────────────────────┘
                                             ▼
                         ┌────────────────┐  ┌──────────────────────┐
                         │ services/      │  │  SQLAlchemy models   │
                         │  bind_parser   │  │  models.py           │
                         │  demo_seed     │  └──────────┬───────────┘
                         └────────────────┘             ▼
                                                   ┌─────────┐
                                                   │ SQLite  │
                                                   └────┬────┘
                                             ▼
                         ┌──────────────────────────────────────────┐
                         │  response_model=ZoneOut  → JSON          │  strips undeclared fields
                         └───────────────────┬──────────────────────┘
                                             ▼
                         ┌──────────────────────────────────────────┐
                         │  get_db teardown: db.close()             │  the code after `yield`
                         └──────────────────────────────────────────┘
```

### The two-layer validation split — the design decision to lead with

This is the most interviewable thing about the backend. State the rule crisply:

> **Anything decidable from the request payload alone lives in `schemas.py`.
> Anything requiring a database lookup lives in the route layer.**

| Layer | Where | Rules it owns | Status on failure |
|---|---|---|---|
| **1 — Schema** | `schemas.py` | Per-record-type rdata format (A must be IPv4, MX must be `<0-65535> <hostname>`, TXT must be quoted strings…), TTL bounds 0–2147483647, record-name normalisation to a lowercase FQDN, routing-policy whitelist, alias-target format | **422** with Pydantic's error list |
| **2 — Route** | `routes/*.py` | `is_protected_record` (apex NS/SOA are read-only), `check_record_set_conflicts` (CNAME-at-apex, CNAME exclusivity, `(zone, name, type)` uniqueness), zone-name uniqueness per owner, "zone must be empty" delete guard, ownership → 404 | **409** / **404** with a string `detail` |

Why the split is *forced*, not arbitrary: a Pydantic model validating `RecordCreate` can
see the payload and nothing else. It cannot know whether a CNAME already exists at that
name, or whether the name equals the zone apex — those need `zone` and sibling rows.
The code says so explicitly:

```python
    """Enforce the two rules the schema layer can't check, because both need other rows.
```
> `backend/app/routes/records.py:72`

```python
    # RecordCreate has already validated name, type and value; these rules need the zone.
    check_record_set_conflicts(db, zone, payload.name, payload.type)
```
> `backend/app/routes/records.py:206-207`

**Where it gets subtle:** `PUT /records/{id}` carries a `RecordUpdate`, which has **no
`type` field** — you can't change a record's type. So the schema can't run the per-type
rdata rules; the route has to feed the *stored* type back in:

```python
def validate_value_or_422(record_type: str, value: str, ttl: Optional[int]) -> str:
    """Validate `value` the way RecordCreate does, given the TTL the record ends up with.
```
> `backend/app/routes/records.py:51-52`

Same for the NS-wildcard rule, which needs the type:

```python
    # RecordUpdate normalises the name without knowing the type, so the NS-wildcard rule
    # is re-run here now that the stored type is available.
```
> `backend/app/routes/records.py:263-264`

**Interview soundbite:** *"Validation is split by information requirement, not by
taste. If a rule is decidable from the payload it's a Pydantic validator and returns
422. If it needs to query other rows it's in the route handler and returns 409. The
awkward case is PUT, because the update schema has no `type` field — so the route reads
the stored type and re-runs the same shared validator function. Both paths call the
same code in `schemas.py`, so create and update can't drift apart."*

---

## 12. "If they ask…" — 10 questions with answers

*Numbered 12 but placed here on purpose: §6–§11 are reference material and live below the
fold, so the reading half ends with the rehearsal questions.*

### Q1. Why FastAPI over Flask, Django, or just Express?

- **vs Flask:** Flask is WSGI (synchronous) and ships no validation or docs. You'd add
  Marshmallow or Pydantic, plus flask-smorest for OpenAPI, and wire them together.
  FastAPI has all of it in the box and is ASGI-native.
- **vs Django:** Django is batteries-included — ORM, admin, auth, templates, migrations.
  Excellent for a large multi-app product, but heavy for a ~19-endpoint JSON API, and
  DRF serializers are more ceremony than Pydantic models.
- **vs Express:** honestly a fine choice, and my strongest stack. FastAPI's edge is that
  validation, typing and OpenAPI come from *one* declaration. In Express I'd write the
  Zod schema, the TypeScript type, and the swagger-jsdoc comment separately — three
  places to keep in sync, and the docs silently rot first.
- **The honest answer:** the brief called for Python. Given Python, FastAPI was the
  right pick — and the auto-generated `/api/docs` was genuinely useful while building
  the frontend against it.

### Q2. How does dependency injection work here?

Declare a parameter with `= Depends(callable)`. FastAPI calls it, and binds the return
value to that parameter. Dependencies can depend on other dependencies —
`get_current_user` takes `db: Session = Depends(get_db)` (`auth.py:52`) — and FastAPI
resolves the graph and **caches per request**, so a route asking for both `get_db` and
`get_current_user` gets the *same* session in both. `get_db` uses `yield`, so its
`finally: db.close()` runs after the response is sent — a connection can never leak.

Versus Express middleware: middleware mutates `req` by side effect and is invisible in
the handler signature; `Depends` returns a value, is per-handler, and shows up in
Swagger.

### Q3. Sync `def` or `async def` — and why?

All sync `def`. SQLAlchemy's ORM here is blocking; putting a blocking call inside an
`async def` blocks the event loop and stalls every concurrent request. FastAPI
automatically runs sync handlers on a threadpool (default 40 workers) so the loop stays
free. The trade-off is that concurrency is capped at the pool size; the upgrade is
async SQLAlchemy + `async def`, which I'd do only after seeing pool saturation.

### Q4. How does validation work?

Two deliberate layers. **Schema layer** (`schemas.py`): anything decidable from the
payload alone — per-record-type rdata format, TTL range 0–2147483647, name
normalisation to a lowercase FQDN, routing-policy whitelist — enforced by Pydantic,
failing with **422**. **Route layer** (`routes/*.py`): anything needing a DB lookup —
CNAME-at-apex, CNAME exclusivity, `(zone, name, type)` uniqueness, protected apex
NS/SOA, per-owner zone-name uniqueness — failing with **409**. The split is forced by
information: a Pydantic model literally cannot see other rows.

### Q5. What is uvicorn?

The ASGI server — the process that binds the port and speaks HTTP. FastAPI is just a
library; uvicorn is what runs it. `uvicorn app.main:app` means "import `app.main`, serve
the object called `app`." It is the exact counterpart of `node server.js`, and it's
literally the production start command in `Procfile:1`.

### Q6. What's the difference between Pydantic and SQLAlchemy models?

Different jobs, and keeping them separate is the point.
**SQLAlchemy models** (`models.py`) describe *database tables* — columns, types,
foreign keys, relationships.
**Pydantic models** (`schemas.py`) describe *API payloads* — what a client may send and
what it will receive.
The separation is a security boundary: `User` has `hashed_password`
(`models.py:38`), but `UserOut` (`schemas.py:40-46`) declares only
`id / email / full_name / created_at`. Because `/api/auth/me` is declared
`response_model=UserOut` (`auth.py:138`), the hash is structurally impossible to leak —
it's not "we remembered to delete it", it's "the response model has no field for it".

### Q7. How do you handle database sessions and transactions?

`SessionLocal` is a session factory (`database.py:15`) configured with
`autocommit=False, autoflush=False` — nothing is written until an explicit
`db.commit()`. `get_db` yields one session per request and closes it in a `finally`.
Within a handler the pattern is mutate-then-commit:

```python
    db.add(zone)
    db.commit()
    db.refresh(zone)
```
> `backend/app/routes/zones.py:133-135`

`db.refresh()` re-reads the row so server-generated values (the autoincrement `id`, the
`server_default=func.now()` timestamp) are populated on the Python object before it's
serialised.

### Q8. What's `check_same_thread: False` about?

```python
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}  # SQLite only
)
```
> `backend/app/database.py:10-13`

SQLite's Python driver defaults to refusing to use a connection from a thread other
than the one that created it. Because sync handlers run on **threadpool** workers
(§2), a connection legitimately crosses threads, so the check must be disabled. It is
SQLite-specific — the flag would be dropped when moving to Postgres. Naming it also
shows you understand *why* the threadpool matters in practice.

### Q9. How would you scale this / what breaks first?

In order:
1. **SQLite + Render's ephemeral disk.** The database is a file that's wiped on every
   deploy (`demo_seed.py:3-6`). First move is Postgres — and it's a one-line change,
   because `DATABASE_URL` is already env-driven (`database.py:8`) and SQLAlchemy
   abstracts the dialect. Only `check_same_thread` would need removing.
2. **The threadpool ceiling** under concurrency → async SQLAlchemy.
3. **Offset pagination.** `.offset((page - 1) * limit)` (`zones.py:98`) makes the
   database walk and discard N rows; deep pages get linearly slower. Cursor/keyset
   pagination fixes it.
4. **No caching or rate limiting** anywhere.

### Q10. What would you change if you rebuilt it?

- `@app.on_event("startup")` → the `lifespan` context manager (the former is deprecated).
- `create_all()` + hand-rolled `PRAGMA table_info` migration → **Alembic**.
- Drop `passlib` and call `bcrypt` directly, which removes the `bcrypt==4.0.1` pin.
- Split `schemas.py` (672 lines) — the DNS validation library deserves to be
  `services/dns_validation.py`, leaving `schemas.py` as just the API models. It's
  already imported *as* a library by both `records.py` and `demo_seed.py`, so the
  seam is already there.
- Add a readiness probe that actually touches the database.
- Rate-limit `/api/auth/login` (see `09-auth-and-security.md`).


---

# 🔎 Reference — do not read this linearly

Everything below is lookup material: the file-by-file inventory, the startup and CORS
detail, and the dependency list. Ctrl-F it when you need a specific fact; skip it on a
read-through.

---

## 6. Every backend file, one line each

| File | Purpose |
|---|---|
| `backend/app/main.py` | Application assembly: creates the `FastAPI` app, configures CORS, mounts the three routers, runs the startup hook, defines `/api/health` and `/` |
| `backend/app/database.py` | SQLAlchemy engine + `SessionLocal` factory + the `Base` all models inherit + the `get_db` dependency |
| `backend/app/models.py` | The ORM tables — `User`, `HostedZone`, `DNSRecord` — plus the `ZoneType`/`RecordType` enums |
| `backend/app/schemas.py` | Pydantic request/response models **and** the whole payload-decidable validation library (per-type rdata rules, name normalisation, alias targets) |
| `backend/app/routes/auth.py` | `/api/auth/*` — login, register, logout, me — plus password hashing, JWT minting and the `get_current_user` dependency every other route depends on |
| `backend/app/routes/zones.py` | `/api/zones` CRUD, list with search/sort/paging, zone export (JSON + BIND), and the zone-ID generator / default NS+SOA seeder |
| `backend/app/routes/records.py` | `/api/zones/{id}/records` CRUD, bulk delete, BIND import, and the DB-dependent validation (`is_protected_record`, `check_record_set_conflicts`) |
| `backend/app/services/bind_parser.py` | A pure-function BIND zone-file parser: text in, `{records, errors}` out. No DB, no FastAPI |
| `backend/app/services/demo_seed.py` | Idempotently populates the demo account with three realistic hosted zones on startup |
| `backend/app/{,routes/,services/}__init__.py` | Empty marker files that make each directory an importable Python package (no Node equivalent — Node infers packages from the filesystem) |
| `backend/requirements.txt` | Pinned dependency list — the `package.json` dependencies block |
| `backend/Procfile` | The production start command: `uvicorn app.main:app` — the `npm start` script |
| `backend/.env` / `.env.example` | Secrets and config, loaded by `python-dotenv`. `.env.example` is the committed template |
| `backend/.python-version` | Pins Python 3.11.9 — an `.nvmrc` for Python |
| `backend/route53.db` | The SQLite database file itself (gitignored) |
| `backend/tests/` | pytest suites: `test_bind_parser.py`, `test_schemas.py`, `test_records_routes.py`, `test_demo_seed.py` — 1,324 lines total |

---

## 7. Startup lifecycle — and why the order matters

Two distinct things happen at boot.

### (a) At import time — table creation

```python
# Create all tables
models.Base.metadata.create_all(bind=engine)
```
> `backend/app/main.py:12-13`

This runs the moment `app.main` is imported. It issues `CREATE TABLE IF NOT EXISTS` for
every model registered on `Base`. It is *not* a migration system — it only ever creates
missing tables; it will never alter an existing one. That limitation is why (b) exists.

### (b) At startup — the four-step hook

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
> `backend/app/main.py:67-77`

```
1. run_migrations()      main.py:16-21    ── add hosted_zones.owner_id if missing
        │                                     (create_all can't ALTER an existing table)
        ▼
2. seed_demo_user(db)    auth.py:77-87    ── ensure demo@route53.aws exists
        │
        ▼
3. adopt_orphan_zones(db) main.py:24-34   ── owner_id IS NULL  →  demo user's id
        │
        ▼
4. seed_demo_content(db) demo_seed.py:279 ── if demo owns 0 zones, create 3 demo zones
```

**Why each arrow is mandatory:**

- **1 before 2 and 3.** `seed_demo_user` writes to `users`, and `adopt_orphan_zones`
  writes `hosted_zones.owner_id`. If the migration hasn't added that column yet, step 3
  is a SQL error. `create_all()` can't help — the table already exists, so it skips it
  entirely and never notices the new column.
- **2 before 3.** Adoption assigns orphans *to the demo user*, so that user must exist.
  The code guards defensively anyway:
  ```python
      demo = db.query(User).filter(User.email == "demo@route53.aws").first()
      if not demo:
          return
  ```
  > `backend/app/main.py:27-29`
- **3 before 4 — and this one has a comment because it's non-obvious:**
  ```python
        # Last, so adopted orphan zones count as existing content and suppress seeding.
  ```
  > `backend/app/main.py:74`

  Seeding is guarded by "does the demo account own any zones?":
  ```python
      if db.query(HostedZone).filter(HostedZone.owner_id == demo.id).count() > 0:
          return
  ```
  > `backend/app/services/demo_seed.py:239-240`

  If seeding ran **before** adoption, the demo account would still look empty, so three
  fresh demo zones would be created — and *then* the pre-existing orphan zones would be
  adopted on top. The account ends up with duplicated/mixed content on every boot.
  Running adoption first makes the orphans count as "content already there", and
  seeding correctly no-ops.

**Why seed on startup at all?** The comment is explicit:

```python
"""Populates the demo account with realistic hosted zones and records.

Render's free plan gives the service an ephemeral filesystem, so route53.db is rebuilt
from scratch on every deploy and every wake-from-idle. Seeding therefore has to happen
on startup rather than once via a migration or a marker file — there is nowhere durable
to record that it already ran, so the presence of the demo user's own zones is the flag.
```
> `backend/app/services/demo_seed.py:1-6`

**Why seeding can never crash the app:**

```python
    try:
        _seed(db)
    except Exception:
        try:
            db.rollback()
        except Exception:
            logger.exception("Rollback after failed demo seeding also failed")
        logger.exception("Demo content seeding failed; starting with an unseeded demo account")
```
> `backend/app/services/demo_seed.py:286-293`

An exception escaping `on_startup` would abort boot. Cosmetic demo data must never take
the API down, so it's swallowed and logged.

> **Weakness → fix.** `@app.on_event("startup")` is deprecated in modern FastAPI in
> favour of the `lifespan` context manager (`@asynccontextmanager`), which handles
> startup *and* shutdown in one function. Likewise, `create_all()` + a hand-rolled
> `PRAGMA table_info` migration is a stand-in for **Alembic**, SQLAlchemy's real
> migration tool (the analogue of `sequelize-cli migrate`). Both are conscious
> scope-cuts for a single-file SQLite demo; on a real deployment I'd use `lifespan` and
> Alembic. Being able to name the replacement is what makes the shortcut defensible.

---

## 8. CORS — what it is and why the config looks like that

**Jargon: CORS (Cross-Origin Resource Sharing).** Browsers enforce the *same-origin
policy*: JavaScript on `https://app.example.com` may not read a response from
`https://api.example.com` unless the API explicitly opts in with
`Access-Control-Allow-Origin` headers. It is a **browser-side** restriction — curl and
Postman ignore it entirely, which is why "it works in Postman but not the browser" is
almost always a CORS problem.

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
> `backend/app/main.py:46-58`

### `allow_credentials=True` forces an explicit origin list

This is a hard rule in the CORS spec, not a FastAPI choice:

> **A response may not use `Access-Control-Allow-Origin: *` together with
> `Access-Control-Allow-Credentials: true`.** The browser rejects the combination.

"Credentials" means cookies. This app puts the JWT in an httpOnly cookie, so the
frontend calls the API with `credentials: 'include'` — which means `allow_credentials`
*must* be `true`, which means `allow_origins` *cannot* be `*`, which means an explicit
allowlist read from `ALLOWED_ORIGINS`.

This is a genuine security property, not a nuisance: if `*` were permitted with
credentials, any website on the internet could make authenticated requests to this API
using the victim's cookie and read the response.

Verified live — the allowed origin is echoed back specifically, never as `*`:

```console
$ curl -i -X OPTIONS http://localhost:8000/api/zones \
    -H "Origin: http://localhost:3000" \
    -H "Access-Control-Request-Method: GET"

HTTP/1.1 200 OK
vary: Origin
access-control-allow-methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT
access-control-max-age: 600
access-control-allow-credentials: true
access-control-allow-origin: http://localhost:3000
```

And a disallowed origin is rejected outright — note the **absence** of
`access-control-allow-origin`, which is what makes the browser block it:

```console
$ curl -i -X OPTIONS http://localhost:8000/api/zones \
    -H "Origin: http://evil.example" \
    -H "Access-Control-Request-Method: GET"

HTTP/1.1 400 Bad Request
vary: Origin
access-control-allow-credentials: true
```

### `expose_headers=["Content-Disposition"]` — the export filename

By default, cross-origin JavaScript can only read a **safelisted** set of response
headers (`Content-Type`, `Cache-Control`, `Expires`, `Last-Modified`, `Pragma`,
`Content-Language`). Everything else is invisible to `fetch`, even though it arrived.

The zone export sets the download filename in a header:

```python
        return JSONResponse(
            content=payload,
            headers={"Content-Disposition": f'attachment; filename="{base_filename}.json"'},
        )
```
> `backend/app/routes/zones.py:231-234`

Verified live:

```console
$ curl -D - -o /dev/null -b cookies.txt \
    "http://localhost:8000/api/zones/1/export?format=json"

HTTP/1.1 200 OK
content-disposition: attachment; filename="vprofile.in.json"
content-length: 565
content-type: application/json
```

Without `expose_headers`, the frontend's `response.headers.get('Content-Disposition')`
returns `null` and the download saves as something generic like `export` or `blob`.
`expose_headers` adds `Access-Control-Expose-Headers: Content-Disposition`, telling the
browser to let JS read it — so the file lands as `vprofile.in.json`.

**Interview soundbite:** *"CORS is browser-enforced, not server-enforced. Two
non-obvious bits here: `allow_credentials=True` makes wildcard origins illegal per
spec, so the origin list has to be explicit and comes from an env var. And
`expose_headers` is needed because cross-origin JS can only read six safelisted
response headers by default — without it the frontend can't read `Content-Disposition`
and the exported zone file downloads with the wrong name."*

---

## 9. The `services/` layer — and why the parser is a pure function

Two modules live in `app/services/`. The interesting one is the BIND parser.

```python
def parse_zone_file(text: str, default_origin: str, default_ttl: int = 300) -> Dict:
    """Parse BIND text. Returns {records: [{name,type,ttl,value}], errors: [str]}.
```
> `backend/app/services/bind_parser.py:41-42`

Look at what this signature does **not** contain: no `db: Session`, no `Request`, no
`current_user`, no FastAPI import anywhere in the file. Its entire import block is:

```python
from typing import List, Dict
```
> `backend/app/services/bind_parser.py:14`

It is a **pure function**: `(str, str, int) -> dict`. Same input, same output, no side
effects, no I/O.

### Why that matters for testing

A test needs no HTTP client, no database, no fixtures, no mocking:

```python
from app.services.bind_parser import parse_zone_file

ORIGIN = "example.com."


def triples(zone: str):
    parsed = parse_zone_file(zone, default_origin=ORIGIN)
    return [(r["name"], r["type"], r["value"]) for r in parsed["records"]]
```
> `backend/tests/test_bind_parser.py:8-15`

Compare with what a route test needs — a whole disposable app and a DB override:

```python
Everything runs against a throwaway SQLite file via a `get_db` dependency override, so
backend/route53.db is never opened.
```
> `backend/tests/test_records_routes.py:14-15`

The parser is ~95 lines of test for ~136 lines of parser, and it caught a real bug —
documented in the test file's own docstring:

```python
The owner-name inheritance cases below cover a real bug: the folded logical line
was stripped before its indentation was inspected, so RFC 1035's "a line starting
with whitespace reuses the previous owner name" never applied. The class token was
consumed as the owner instead, silently importing records named `IN.<zone>`.
```
> `backend/tests/test_bind_parser.py:3-6`

That's the argument in one sentence: **BIND parsing is intricate, error-prone logic
with dozens of edge cases; isolating it from HTTP and the DB means each edge case costs
three lines to test instead of thirty.**

### Where the DB coupling lives instead

The route calls the pure parser, then does all the stateful work itself:

```python
    parsed = parse_zone_file(payload.zone_file, default_origin=zone.name)
```
> `backend/app/routes/records.py:370`

Ownership, validation, upsert and commit all stay in `records.py:368-425`.

### `demo_seed.py` — the other service

Not pure (it takes a `Session`), but note it **reuses** the API's own validators rather
than duplicating rules:

```python
Every name and value below is pushed through the same validators the API uses, so the
demo data can never be something the console itself would reject.
```
> `backend/app/services/demo_seed.py:8-9`

```python
from app.routes.zones import generate_zone_id, seed_default_ns_soa
from app.schemas import normalize_record_name, validate_record_value
```
> `backend/app/services/demo_seed.py:17-18`

And it validates everything *before* writing anything:

```python
    """Normalise and validate every zone's records without touching the database.

    Doing this first means a typo in the data above fails before anything is written,
    so a bad spec can't leave the demo account holding a half-populated zone.
    """
```
> `backend/app/services/demo_seed.py:208-212`

**Interview soundbite:** *"The BIND parser is a pure function — text in, records-plus-errors
out, zero FastAPI or SQLAlchemy imports. That's deliberate: zone-file syntax has a lot
of edge cases like owner-name inheritance and parenthesised multi-line records, and each
one costs three lines to test when there's no HTTP layer in the way. The route keeps all
the stateful parts — ownership, validation, upsert."*

---

## 10. `requirements.txt` — every package and why

```
fastapi==0.137.2
uvicorn[standard]==0.49.0
SQLAlchemy==2.0.51
pydantic==2.13.4
python-dotenv==1.2.2
passlib[bcrypt]==1.7.4
bcrypt==4.0.1
python-jose[cryptography]==3.5.0
cryptography==49.0.0
pytest==9.1.1
# TestClient needs an HTTP client; httpx2 avoids starlette's deprecation warning.
httpx2==2.9.1
```
> `backend/requirements.txt:1-12`

| Package | Node analogue | What it does here |
|---|---|---|
| `fastapi` | `express` | The web framework itself |
| `uvicorn[standard]` | `node` + `nodemon` | The ASGI server process. `[standard]` = the C-accelerated extras (`uvloop`, `httptools`) |
| `SQLAlchemy` | `sequelize` / `typeorm` | ORM + query builder. Defines `models.py`, powers every `db.query(...)` |
| `pydantic` | `zod` + `class-validator` | Validation and serialisation — `schemas.py` |
| `python-dotenv` | `dotenv` | Loads `backend/.env` into `os.environ` — called at `database.py:6` and `auth.py:12` |
| `passlib[bcrypt]` | `bcrypt` wrapper | `CryptContext` — the hashing API. Handles salting, algorithm identifiers and rehash policy |
| `bcrypt` | `bcrypt` | The actual hashing implementation passlib drives. **Pinned to `4.0.1` — see below** |
| `python-jose[cryptography]` | `jsonwebtoken` | Mints and verifies the JWTs (`jwt.encode` / `jwt.decode`) |
| `cryptography` | node's `crypto` | The low-level primitives `python-jose` uses for HS256 signing |
| `pytest` | `jest` / `mocha` | Test runner for `backend/tests/` |
| `httpx2` | `supertest` / `axios` | The HTTP client FastAPI's `TestClient` drives. The comment in the file explains the choice of `httpx2` over `httpx` |

### The `bcrypt==4.0.1` pin — a great story to tell

This is the kind of detail that shows you actually shipped something.

`passlib` 1.7.4 (released 2020) reads the bcrypt backend's version by reaching for
`bcrypt.__about__.__version__`. bcrypt **4.1** removed that internal `__about__`
module. The result is that on `passlib==1.7.4` + `bcrypt>=4.1`, the first hash call
raises inside passlib's version detection — so **every login and registration breaks**,
with a traceback that points at passlib's internals rather than at your code.

Pinning `bcrypt==4.0.1` keeps the attribute passlib expects. Both lines are pinned
adjacently for exactly this reason:

```
passlib[bcrypt]==1.7.4
bcrypt==4.0.1
```
> `backend/requirements.txt:6-7`

> **Weakness → fix.** Holding a security-relevant library one minor version back is a
> smell, even when it's the documented workaround. The real fix is to drop passlib
> entirely and call `bcrypt` directly (`bcrypt.hashpw` / `bcrypt.checkpw`), or move to
> `pwdlib`/`argon2-cffi` — passlib has been effectively unmaintained since 2020.
> `CryptContext` is buying very little here since there's only one scheme configured.

**Note on pinning generally:** every line uses `==`, not `>=` or `^`. That's the
equivalent of committing a `package-lock.json` — the same versions install everywhere,
so "works on my machine" and "works on Render" are the same machine.

---

## 11. Auto-generated docs — the free win

```python
app = FastAPI(
    title="Route53 Clone API",
    description="A functional clone of AWS Route53 — Hosted Zones & DNS Records management",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)
```
> `backend/app/main.py:36-42`

FastAPI derives an OpenAPI 3 spec from your type hints, Pydantic models and `Query`
declarations, then serves two UIs over it. Because the spec comes from the same
annotations that enforce validation at runtime, **the docs cannot drift from the
implementation** — the classic failure mode of hand-maintained Swagger comments.

Verified live:

| URL | Status | What it is |
|---|---|---|
| `/api/docs` | **200** `text/html` | Swagger UI — interactive, "Try it out" works |
| `/api/redoc` | **200** | ReDoc — cleaner read-only reference |
| `/openapi.json` | **200** | The raw machine-readable spec |
| `/docs` (the default) | **404** | Deliberately relocated |

**Why relocated?** The defaults are `/docs` and `/redoc` at the root. Everything else in
this API lives under `/api`, so moving the docs there keeps the entire API surface under
one prefix — which matters when a reverse proxy or a Vercel rewrite routes `/api/*` to
the backend and everything else to the frontend. Leaving docs at `/docs` would mean a
second, special-cased proxy rule.

I used `/openapi.json` to verify the endpoint count for these notes:

```console
$ curl -s http://localhost:8000/openapi.json | python -c \
  "import sys,json; d=json.load(sys.stdin); \
   [print(m.upper().ljust(7), p) for p,ops in d['paths'].items() for m in ops]"

POST    /api/auth/login
POST    /api/auth/register
POST    /api/auth/logout
GET     /api/auth/me
GET     /api/zones
POST    /api/zones
GET     /api/zones/{zone_id}
PUT     /api/zones/{zone_id}
DELETE  /api/zones/{zone_id}
GET     /api/zones/{zone_id}/export
GET     /api/zones/{zone_id}/records
POST    /api/zones/{zone_id}/records
DELETE  /api/zones/{zone_id}/records
GET     /api/zones/{zone_id}/records/{record_id}
PUT     /api/zones/{zone_id}/records/{record_id}
DELETE  /api/zones/{zone_id}/records/{record_id}
POST    /api/zones/{zone_id}/records/import
GET     /api/health
GET     /
```

**19 endpoints** — 4 auth, 6 zones, 7 records, plus health and root.
Full detail on each is in `04-backend-apis.md`.

### Health check

```python
@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "service": "route53-clone-api"}
```
> `backend/app/main.py:81-83`

```console
$ curl http://localhost:8000/api/health
{"status":"ok","service":"route53-clone-api"}
```

Unauthenticated by design — it's what a platform's health prober and uptime monitor
hit. On Render's free tier it also doubles as a wake-from-idle ping.

> **Weakness → fix.** It's a *liveness* check (the process is up), not a *readiness*
> check (dependencies are reachable). A production version would attempt
> `SELECT 1` against the DB and return 503 if that fails, so a load balancer stops
> routing to an instance whose database connection has died.
