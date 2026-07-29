# 04 — Backend API Reference

> ### TL;DR — the 5 things you must be able to say
>
> 1. **19 endpoints** — 4 auth, 6 hosted-zone, 7 record, plus health and root; the whole surface lives under `/api`.
> 2. **`detail` is a string OR a list** — a hand-raised `HTTPException` returns a string, a Pydantic failure returns an array of error objects, and the status code alone does not tell you which (§2.4).
> 3. **404, never 403** — the ownership filter sits inside the `WHERE` clause at seven query sites, so another tenant's zone is byte-identical to one that never existed (§6).
> 4. **`ttl IS NULL` is the alias flag** — one implicit convention that six code sites must agree on, and a column default once silently broke all of them (§2.6).
> 5. **Import returns 200 on partial success** — `{created, updated, skipped, errors}`, upserting on `(zone_id, name, type)` so a corrected re-run converges instead of duplicating (§5.7).
>
> **Read** §1–§2 and §6 (~8 min). **Look up** the per-endpoint sections under 🔎 Reference.

Every response body here was **captured from the running API** at `http://localhost:8000`;
nothing is invented, and code snippets carry `file:line` references. Read
`03-backend-overview.md` first for the FastAPI-vs-Express framing.

## 1. All 19 endpoints at a glance

| # | Method | Path | Purpose | Auth |
|---|---|---|---|---|
| **Auth** — `routes/auth.py`, `APIRouter(prefix="/auth")` | | | | |
| 1 | `POST` | `/api/auth/login` | Exchange credentials for a JWT; sets the session cookie | No |
| 2 | `POST` | `/api/auth/register` | Create an account and auto-sign-in | No |
| 3 | `POST` | `/api/auth/logout` | Clear the session cookie | No |
| 4 | `GET` | `/api/auth/me` | Return the current user | **Yes** |
| **Hosted zones** — `routes/zones.py`, `APIRouter(prefix="/zones")` | | | | |
| 5 | `GET` | `/api/zones` | List zones — search, filter, sort, paginate | **Yes** |
| 6 | `POST` | `/api/zones` | Create a zone (auto-seeds apex NS + SOA) | **Yes** |
| 7 | `GET` | `/api/zones/{zone_id}` | Fetch one zone | **Yes** |
| 8 | `PUT` | `/api/zones/{zone_id}` | Update comment and/or type | **Yes** |
| 9 | `GET` | `/api/zones/{zone_id}/export` | Download as JSON or a BIND zone file | **Yes** |
| 10 | `DELETE` | `/api/zones/{zone_id}` | Delete a zone (only when empty) | **Yes** |
| **DNS records** — `routes/records.py`, `APIRouter(prefix="/zones/{zone_id}/records")` | | | | |
| 11 | `GET` | `/api/zones/{zone_id}/records` | List records — search, 3 filters, sort, paginate | **Yes** |
| 12 | `POST` | `/api/zones/{zone_id}/records` | Create a record | **Yes** |
| 13 | `DELETE` | `/api/zones/{zone_id}/records?ids=1,2,3` | **Bulk** delete via CSV query param | **Yes** |
| 14 | `GET` | `/api/zones/{zone_id}/records/{record_id}` | Fetch one record | **Yes** |
| 15 | `PUT` | `/api/zones/{zone_id}/records/{record_id}` | Update a record | **Yes** |
| 16 | `DELETE` | `/api/zones/{zone_id}/records/{record_id}` | Delete one record | **Yes** |
| 17 | `POST` | `/api/zones/{zone_id}/records/import` | Import a BIND zone file | **Yes** |
| **Meta** — `main.py` | | | | |
| 18 | `GET` | `/api/health` | Liveness probe | No |
| 19 | `GET` | `/` | API banner + docs link | No |

Enumerated from the live `/openapi.json`. Plus three non-endpoint docs routes served by
FastAPI itself: `/api/docs` (Swagger UI),
`/api/redoc` (ReDoc), `/openapi.json` (raw spec). The defaults `/docs` and `/redoc` are
**404** — relocated at `main.py:40-41` so the whole API surface lives under `/api`.

### Route ordering — a subtle correctness detail

`records.py:25` declares `APIRouter(prefix="/zones/{zone_id}/records")`, so `POST /import`
(`records.py:355`) resolves to `/api/zones/{zone_id}/records/import` — a path that could
in principle collide with `GET /{record_id}`. It doesn't, because the methods differ
*and* because `record_id: int` means `"import"` would fail integer parsing anyway. Worth
knowing: **Starlette matches routes in declaration order**, so a literal segment declared
after a parameterised one of the same method would be shadowed. Not a live bug here, but
the kind of thing an interviewer probes.

## 2. Shared conventions (explained once, apply everywhere)

### 2.1 Authentication

Every "Auth: Yes" endpoint declares `current_user: User = Depends(get_current_user)`.
`get_current_user` (`auth.py:52-74`) reads the JWT from the **httpOnly cookie first**,
falling back to an `Authorization: Bearer` header. Missing/expired/tampered → **401**
`{"detail":"Not authenticated"}`. Details in `09-auth-and-security.md`. Because this is
universal, the per-endpoint entries below omit the 401 row.

### 2.2 The `Paginated<T>` envelope

Both list endpoints return the same five-key shape — `ZoneListResponse`
(`schemas.py:103-108`) and `RecordListResponse` (`schemas.py:656-661`) are
field-for-field identical apart from the item type:

```ts
{ items: T[],           // this page's rows
  total: number,        // rows matching the filters, across ALL pages
  page, limit: number,  // echoed back
  pages: number }       // ceil(total / limit), floored at 1
```

`total` is a separate `COUNT` executed **before** paging —
`total = query.count()`, then `pages = math.ceil(total / limit) if total > 0 else 1`
(`backend/app/routes/zones.py:84-85`, identical at `records.py:174-175`). The
`if total > 0 else 1` matters:
`ceil(0/20) == 0`, and a table widget rendering "Page 1 of 0" looks broken. Empty results
report `pages: 1`. In the reference sections below, list responses are printed with a
single item followed by `…`; every other item has the identical shape.

### 2.3 Query-parameter conventions

| Param | Zones (`zones.py:66-75`) | Records (`records.py:140-151`) | Behaviour |
|---|---|---|---|
| `search` | `""` | `""` | Zones: `name ILIKE %term%` (`zones.py:79`). Records: `name ILIKE %term% OR value ILIKE %term%` (`records.py:158-160`) |
| `page` | `1` (`ge=1`) | `1` (`ge=1`) | 1-based |
| `limit` | `20` (`ge=1, le=100`) | `20` (`ge=1, le=100`) | Hard cap of 100 |
| `sort_by` | `created_at` | `name` | Whitelisted dictionary key — see below |
| `sort_order` | `desc` (`^(asc\|desc)$`) | `asc` (`^(asc\|desc)$`) | Regex-constrained in the `Query` declaration, so a bad value is a 422 *before* the handler runs |
| `type` | `""` | `""` | Zones: applied only if exactly `Public` or `Private` (`zones.py:81`). Records: exact match, **uppercased** (`records.py:163`) |
| `routing_policy` | — | `""` | Exact match |
| `alias` | — | `""` | `Alias` → `ttl IS NULL`; `Non-alias` → `ttl IS NOT NULL` (`records.py:169-172`) |

**Sortable columns.** Zones: `name`, `type`, `comment`, `zone_id`, `created_at`,
**`record_count`**. Records: `name`, `type`, `routing_policy`, `value`, `ttl`. Records'
`search` covers **both** name and value, so searching `192.0.2` finds records by their IP
— what you actually want in a DNS console.
**`sort_by` is whitelisted, never interpolated** — a SQL-injection defence worth calling
out. The user's string is a **dictionary key**, never SQL text:

```python
SORTABLE_ZONE_COLUMNS = {"name": …, "type": …, "comment": …, "zone_id": …, "created_at": …}
sort_column = SORTABLE_ZONE_COLUMNS.get(sort_by, HostedZone.created_at)
```
> `backend/app/routes/zones.py:56-62` (the whitelist), `backend/app/routes/zones.py:95` (the lookup)

An unknown value silently falls back to a safe default rather than erroring — a
deliberate choice so a stale frontend can't 500 the list view.
**Stable pagination.** `query.order_by(ordering, DNSRecord.id)`
(`backend/app/routes/records.py:179-182`) —
*"Sorting happens in SQL before paging, so the order holds across every page. Most
columns aren't unique within a zone, so id breaks ties for a stable page split."* Without
that `id` tiebreaker, ten records all typed `A` have no defined relative order, and SQLite
may return them differently between the page-1 and page-2 queries, so a row can appear
twice or vanish. A real, commonly-missed pagination bug.

### 2.4 `detail` is a string OR a list — the thing that trips people up

**This catches everyone.** FastAPI returns two structurally different bodies under the
same `detail` key:

**(a) Manual `HTTPException` → `detail` is a STRING**

```python
        raise HTTPException(status_code=404, detail="Hosted zone not found")
```
> `backend/app/routes/zones.py:155`

```json
{"detail": "Hosted zone not found"}
```

**(b) Pydantic validation failure → `detail` is a LIST OF OBJECTS**

```json
{"detail": [
  {"type": "less_than_equal",
   "loc": ["body", "ttl"],
   "msg": "Input should be less than or equal to 2147483647",
   "input": 99999999999,
   "ctx": {"le": 2147483647}}
]}
```

Both are real captures from this API. A frontend doing
`toast(err.response.data.detail)` renders `[object Object]` for case (b).

| | Manual `HTTPException` | Pydantic 422 |
|---|---|---|
| `detail` type | `string` | `Array<{type, loc, msg, input, ctx?}>` |
| Statuses | 400, 401, 404, 409, 422 (route-raised) | Always 422 |
| Where from | `raise HTTPException(...)` in a route | FastAPI's `RequestValidationError` handler |
| `loc` | absent | `["body","ttl"]`, `["query","limit"]`, `["path","zone_id"]` |

**Note the overlap:** the route layer *also* raises 422 with a string detail, e.g.
`validate_value_or_422` (`records.py:62`) and the PUT name check (`records.py:270`). So
**status code alone doesn't tell you the shape** — the client must type-check:

```js
const msg = Array.isArray(detail) ? detail.map(e => e.msg).join(', ') : detail;
```

**Interview soundbite:** *"FastAPI's error envelope isn't uniform — `detail` is a
string when you raise `HTTPException` yourself, but a list of error objects for a
Pydantic validation failure. And because my route layer raises 422s with string details
too, you can't switch on the status code; the client has to check whether `detail` is an
array. If I were designing the API contract from scratch I'd add a global
`RequestValidationError` handler to flatten Pydantic's list into one string, so every
error has exactly one shape."*

**This is the one place the Pydantic array is printed in full.** The reference sections
quote only the `msg` and point back here.

### 2.5 Status codes used across the API

| Code | Meaning here | Example trigger |
|---|---|---|
| **200** | OK | Any GET; `PUT`; **and `POST /import`, even on partial failure** |
| **201** | Created | `POST /api/zones`, `POST /records`, `POST /register` |
| **204** | No Content | All three DELETE endpoints — empty body |
| **400** | Bad request (route-raised) | `PUT /zones/{id}` with `type: "Hybrid"`; bulk delete with non-integer `ids` |
| **401** | Unauthenticated | No/expired/invalid token; bad login credentials |
| **404** | Not found **or not yours** | Foreign zone, missing zone, missing record — see §6 |
| **409** | Conflict | Duplicate zone name, duplicate record set, CNAME rules, protected NS/SOA, non-empty zone delete |
| **422** | Unprocessable | Pydantic body/query/path failure; route-raised value errors |

Two blanket rules, so the per-endpoint entries don't restate them: **401** applies to
every authenticated endpoint (§2.1), and **422** covers a non-integer `{zone_id}` or
`{record_id}` on *every* parameterised route, with `loc: ["path", …]`. There is **no 403
anywhere in this API**, on purpose — see §6.

### 2.6 The alias convention — `ttl IS NULL`

**`ttl IS NULL` marks an alias record.** This one convention shows up in six places:

| Where | Code | `file:line` |
|---|---|---|
| Column allows null, with a warning comment | `ttl = Column(Integer, nullable=True)` | `models.py:73-77` |
| Create validation branches on it | `validate_alias_target(...) if self.ttl is None else validate_record_value(...)` | `schemas.py:614-618` |
| Update validation branches on it | `if ttl is None: return validate_alias_target(value)` | `records.py:57-59` |
| List filter | `query.filter(DNSRecord.ttl.is_(None))` | `records.py:169-172` |
| Import validation branches on it | `validate_alias_target(value) if ttl is None else ...` | `records.py:391-394` |
| BIND export substitutes a TTL | `ttl = r.ttl or 300` | `zones.py:240` |

**Why:** in real Route 53 an alias record points at an AWS endpoint (an ELB, a CloudFront
distribution) and inherits *that* target's TTL, so it has none of its own. Its `value` is
a hostname, not rdata for its declared type — an **A-type** alias holds
`my-lb.us-east-1.elb.amazonaws.com`, which would fail the "A records must be an IPv4
address" rule. The docstring at `backend/app/schemas.py:516-520` spells this out: *"…Route
53 answers with the target's value and uses the target's TTL, which is why alias records
carry no TTL of their own. Applying the per-type rdata rules here would reject a perfectly
valid alias, e.g. an A-type alias pointing at an ELB hostname."*
**A real bug this caused**, preserved as a comment on the column
(`backend/app/models.py:73-77`): *"No column default: SQLAlchemy applies one whenever the
attribute is None at flush time, which silently rewrote the NULL that marks an alias
record as 300. `RecordCreate.ttl` already defaults to 300 when the client omits it, so the
only case the column default served is still covered."* One default turned every alias
back into a normal record.

> **Weakness → fix.** Encoding "is this an alias?" in the *absence* of a TTL is
> implicit — six places must agree, and one column default nearly broke all of them. An
> explicit `is_alias = Column(Boolean, default=False)` (plus a CHECK constraint that
> alias implies null TTL) would make the invariant self-documenting and impossible to
> clobber. The counter-argument is that this mirrors how Route 53's API models it, and
> the clone's job is fidelity.

## 6. Multi-tenancy: 404, never 403

`owner_id == current_user.id` is repeated at **seven** query sites:

| Endpoint | `file:line` |
|---|---|
| `GET /zones` | `zones.py:76` |
| `POST /zones` (duplicate check) | `zones.py:117` |
| `GET /zones/{id}` | `zones.py:151` |
| `PUT /zones/{id}` | `zones.py:168` |
| `GET /zones/{id}/export` | `zones.py:196` |
| `DELETE /zones/{id}` | `zones.py:258` |
| `get_zone_or_404` — covers **all seven** record endpoints | `records.py:34` |

**Verified live.** Zone 4 (`freshzone.dev.`) exists and belongs to user 4. Requesting it
as the demo user (user 1) returns exactly what a nonexistent zone returns:

```console
# zone 4 EXISTS but is owned by another user
$ curl -b cookies.txt http://localhost:8000/api/zones/4
{"detail":"Hosted zone not found"}      # HTTP 404

$ curl -b cookies.txt http://localhost:8000/api/zones/4/records
{"detail":"Hosted zone not found"}      # HTTP 404

# zone 9999 does NOT exist — byte-identical response
$ curl -b cookies.txt http://localhost:8000/api/zones/9999
{"detail":"Hosted zone not found"}      # HTTP 404
```

**Why not 403?** A 403 means *"this exists, but you may not have it"* — an information
leak. An attacker enumerating `/api/zones/1..1000` and recording which IDs returned 403
versus 404 would learn exactly how many zones the platform hosts and which IDs are live,
without ever seeing their contents. Returning 404 for both cases makes *existence itself*
unobservable across tenants; GitHub does the same for private repos, and it's the standard
OWASP recommendation. The trade-off: a legitimate user who genuinely lost access sees a
confusing "not found" rather than "access denied" — which for a multi-tenant system with
no sharing model never happens, since every zone is either yours or invisible.

## 7. "If they ask…"

### Q1. Why 404 instead of 403 for another user's zone?

Because 403 confirms the resource exists. Enumerating IDs and watching for 403-vs-404
maps out the platform's entire inventory without authorisation. Returning 404 for both
"doesn't exist" and "not yours" makes existence unobservable. I verified this: zone 4
exists and belongs to another account, and it returns the same body and status as zone
9999, which doesn't exist. It's enforced structurally — the ownership filter is part of
the `WHERE` clause (`zones.py:151`, `records.py:34`), not a post-fetch `if`, so there's
no code path where a foreign row is loaded and then checked.

### Q2. How would you version this API?

I wouldn't retrofit it; I'd plan the seam. The cheapest option given the current
structure is URL versioning, because routers are already mounted with a prefix in one
place:

```python
app.include_router(zones.router, prefix="/api")
```
> `backend/app/main.py:62`

That becomes `prefix="/api/v1"`, and a v2 mounts a different router module beside it —
two versions can run simultaneously with shared services and separate schemas. It's
explicit, cacheable, trivially debuggable in a browser, and it's what AWS, Stripe and
GitHub effectively do.

The alternatives and why I'd skip them here: **header versioning**
(`Accept: application/vnd.api+json;version=2`) is purer REST but invisible in logs and
awkward to test by hand; **query-param versioning** (`?version=2`) is easy but pollutes
every cache key.

The bigger point: versioning is only needed for **breaking** changes. Adding an optional
field or a new endpoint is backward-compatible. I'd version when I had to remove a
field, change a type, or alter a status code — and then run v1 and v2 in parallel with a
deprecation window rather than cutting over.

### Q3. Why is sorting done server-side?

Because sorting must happen **before** pagination, and pagination happens in the
database. If the client sorted its own page, it would only be sorting the 20 rows it
happened to receive — page 1 sorted by name would show the 20 *newest* zones arranged
alphabetically, not the 20 alphabetically-first zones. That's not sorting, it's
shuffling.

```python
    ordering = sort_column.asc() if sort_order == "asc" else sort_column.desc()
    zones = query.order_by(ordering).offset((page - 1) * limit).limit(limit).all()
```
> `backend/app/routes/zones.py:97-98` — `order_by` precedes `offset`/`limit`

Two more reasons: the database can use an index (`name`, `created_at` and `type` are all
indexed), and it avoids shipping every row to the client just so it can sort them.

The safety property is that `sort_by` is a **whitelist key lookup**
(`SORTABLE_ZONE_COLUMNS`, `zones.py:56-62`), never string-interpolated SQL — so a
malicious `sort_by` can't inject. Unknown values fall back to a default instead of
erroring, so a stale frontend degrades gracefully.

And `record_count` — a Python property, not a column — is handled by pushing a
correlated `COUNT` subquery into SQL (`zones.py:87-93`) rather than sorting in Python,
precisely so it still composes with `LIMIT`/`OFFSET`.

### Q4. What happens if I create a duplicate record?

409, with a message naming the exact conflict. There are three distinct duplicate-ish
cases, all in `check_record_set_conflicts` (`records.py:65-125`):

1. **Same `(zone, name, type)`** → `"A A record for 'www.example.com.' already exists."`
   Route 53 keys a record *set* on name+type; a second one isn't a duplicate row, it's
   an invalid request. Multiple values go in **one** record via newline-separated
   `value`.
2. **CNAME where another record already lives** →
   `"'www...' already has a A record. DNS doesn't allow a CNAME to share a name with any other record."`
3. **CNAME at the apex** → `"...Create an alias record instead."`

All three need a database query, which is exactly why they're in the route layer and not
in Pydantic (see `03-backend-overview.md` §5).

> **Weakness → fix.** There is **no unique index** on `(zone_id, name, type)` — the rule
> is enforced only by that check-then-insert. Two concurrent POSTs can both pass the
> check before either commits, and both insert. The fix is a `UniqueConstraint` on the
> table so the database is the final arbiter, then catching `IntegrityError` and
> translating it to the same 409. The check stays for the good error message; the
> constraint guarantees correctness. In practice SQLite's write lock makes this very
> hard to hit, but it's a real race and I'd name it as one.

### Q5. Why does import return 200 with an error list instead of failing?

Because a zone file is a bulk document, and all-or-nothing turns one typo into a
find-fix-retry loop over hundreds of lines. Returning
`{created, updated, skipped, errors}` imports everything valid and reports precisely
what didn't and why — see the real response in §5.7, where 2 records imported, 3 were
skipped, and 2 actionable errors came back.

The trade-off is that it isn't atomic. It's acceptable here because the operation is an
**upsert** on `(zone_id, name, type)` (`records.py:400-411`), so re-running the corrected
file converges instead of duplicating. For anything with transactional semantics I'd
reverse the decision and 422 the whole batch.

### Q6. Why does DELETE return 204 and not the deleted object?

204 No Content means "succeeded, and there is deliberately no body." Returning the
deleted object invites the client to treat a tombstone as live state. All three DELETEs
declare it explicitly (`status_code=status.HTTP_204_NO_CONTENT`) and `return None`.

One consequence to know: **a 204 must not have a body**, so you cannot attach an
explanatory message to a successful delete. That's why the *failure* paths use 409 with
a `detail` string instead.

### Q7. Why are there two IDs on a zone?

`id` is the integer primary key used in URLs. `zone_id` is the Route 53-style display ID
— `"Z" + 13 random uppercase alphanumerics` (`zones.py:18-21`) — surfaced in the console
because that's what AWS shows. It's `unique=True, index=True` (`models.py:50`) so it
*could* become the public identifier; routing on the integer PK was the simpler choice.

> **Weakness → fix.** Sequential integer IDs in URLs are enumerable. That's why the
> 404-not-403 behaviour matters so much here — enumeration reveals nothing. If I wanted
> defence in depth I'd route on `zone_id` (already unique and indexed) or on a UUID, so
> guessing a neighbour's identifier is infeasible rather than merely unrewarding.

---

# 🔎 Reference — do not read this linearly

Everything below is per-endpoint lookup: parameters, status codes and captured
request/response pairs. Ctrl-F for the endpoint you need; skip it on a read-through.

---

## 3. Auth endpoints

### 3.1 `POST /api/auth/login`

Auth: not required. Verifies credentials, mints a 24-hour JWT, sets it as an httpOnly
cookie **and** returns it in the body so a non-browser client can use
`Authorization: Bearer`. **Request body** — `LoginRequest` (`schemas.py:9-11`): `email`
(string, required, **no format validation**) and `password` (string, required, no length
rule at login). `LoginRequest` has no validators at all, unlike `RegisterRequest` —
deliberate, because login must not tell an attacker *why* a credential failed; a
malformed email and a wrong password both produce the same generic 401. **Response** —
`TokenResponse` (`schemas.py:35-37`): `{access_token, token_type}`.
**Statuses:** **200** credentials valid; **401** unknown email *or* wrong password, one
message for both (`auth.py:93-97`); **422** `email`/`password` missing from the body.
Capture, noise headers elided:

```console
$ curl -i -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" \
    -d '{"email":"demo@route53.aws","password":"Demo1234!"}'
HTTP/1.1 200 OK
…
set-cookie: access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vQHJvdXRlNTMuYXdzIiwiZXhwIjoxNzg1Mzg2NjM0fQ.C2M8SognTplFaNga3yKA4quH1GEos4TWjYkdBBTmNGE; HttpOnly; Max-Age=86400; Path=/; SameSite=lax

{"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vQHJvdXRlNTMuYXdzIiwiZXhwIjoxNzg1Mzg2NjM0fQ.C2M8SognTplFaNga3yKA4quH1GEos4TWjYkdBBTmNGE","token_type":"bearer"}
```

The same token appears twice on purpose — cookie for the browser, body for CLI clients.
A wrong password (and, identically, an unknown email) gives
`{"detail":"Invalid email or password"}` — **401**.

### 3.2 `POST /api/auth/register`

Auth: not required. Creates an account and immediately signs it in — the same token +
cookie as login (`auth.py:122-125`), so the frontend needs no second round-trip.
**Request body** — `RegisterRequest` (`schemas.py:14-32`): `email` (required; stripped,
must contain `@` and a `.` after it, `schemas.py:19-25`), `password` (required, minimum 8
characters, `schemas.py:27-32`), `full_name` (optional free text, defaults `null`).
**Response:** `TokenResponse`, identical shape to §3.1.
**Statuses:** **201** account created and signed in; **409** email already registered
(`auth.py:106-111`); **422** email malformed, or password under 8 chars. Capture below is
a non-mutating failure path, so no test account was created:

```console
$ curl -X POST http://localhost:8000/api/auth/register -H "Content-Type: application/json" \
    -d '{"email":"demo@route53.aws","password":"Demo1234!","full_name":"Dup"}'
{"detail":"An account with this email address already exists"}     # HTTP 409
```

The two 422s are Pydantic `value_error` arrays in the §2.4 shape, with
`loc: ["body","password"]` / `msg: "Value error, Password must be at least 8 characters"`
and `loc: ["body","email"]` / `msg: "Value error, Enter a valid email address"`.

### 3.3 `POST /api/auth/logout`

Clears the cookie. Takes no body and — notably — **requires no authentication**
(`def logout(response: Response)`, `backend/app/routes/auth.py:128-129`). That's harmless (the worst you can
do is clear your own cookie) but it reveals the architecture: there is **no server-side
session to destroy**, and the JWT stays cryptographically valid until it expires.
Covered fully in `09-auth-and-security.md`. Only status: **200**, always. The
`Max-Age=0` expiry is what deletes the cookie:

```console
$ curl -i -X POST http://localhost:8000/api/auth/logout
HTTP/1.1 200 OK
set-cookie: access_token=""; expires=Wed, 29 Jul 2026 04:45:52 GMT; Max-Age=0; Path=/; SameSite=lax

{"message":"Logged out successfully"}
```

### 3.4 `GET /api/auth/me`

Auth: required. Returns the authenticated user; the frontend calls this on mount to decide
whether to show the console or bounce to the sign-in page. The entire handler is two lines
because the dependency does all the work — `def me(current_user: User =
Depends(get_current_user)): return current_user`, decorated
`@router.get("/me", response_model=UserOut)` (`backend/app/routes/auth.py:138-140`).
`response_model=UserOut` is the security control: `UserOut` (`schemas.py:40-46`)
declares only `id`, `email`, `full_name`, `created_at`, so `hashed_password` cannot leak
even though it exists on the ORM object being returned. Non-obvious status: **401** also
fires when the user row was deleted after the token was issued. A cookie and a Bearer
header return byte-identical bodies:

```console
$ curl -b cookies.txt http://localhost:8000/api/auth/me
{"id":1,"email":"demo@route53.aws","full_name":"AWS Demo User","created_at":"2026-06-19T00:04:02"}
$ curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs...TmNGEx" http://localhost:8000/api/auth/me
{"detail":"Invalid token"}      # HTTP 401 — one character appended breaks the signature
$ curl http://localhost:8000/api/auth/me
{"detail":"Not authenticated"}  # HTTP 401 — no credentials at all
```

Two distinct messages: `"Not authenticated"` = no token presented (`auth.py:61`);
`"Invalid token"` = presented but failed verification (`auth.py:67`, `auth.py:69`).

## 4. Hosted-zone endpoints

Auth: required on all six; all six 404 on a zone that doesn't exist *or* isn't yours (§6).

### 4.1 `GET /api/zones`

Lists **only the calling user's** zones. Query parameters are the shared set in §2.3.
**Response:** `ZoneListResponse`, built via `from_orm_with_count` (`schemas.py:89-100`)
because `ZoneOut` needs the computed count injected. **Statuses:** **200** always, even
with zero matches; **422** for `page < 1`, `limit > 100`, or `sort_order` not
`asc`/`desc` — §2.4 shape with `loc: ["query", …]`.
**`sort_by=record_count` is the interesting one.** `record_count` is a Python
`@property` (`models.py:61-63`), not a column — so you cannot `ORDER BY` it. The fix is
a correlated subquery pushed into SQL:

```python
    if sort_by == "record_count":
        sort_column = (select(func.count(DNSRecord.id))
                       .where(DNSRecord.zone_id == HostedZone.id)
                       .correlate(HostedZone).scalar_subquery())
```
> `backend/app/routes/zones.py:87-93`

Counting in Python instead would break pagination entirely. Capture, truncated to one
item (the other two are the same shape; on the two IDs, see §7 Q7):

```console
$ curl -b cookies.txt "http://localhost:8000/api/zones?limit=3&page=1"

{"items": [
   {"id": 6, "zone_id": "Z65Q8SD1QYQA89", "name": "shubh-gupta.in.", "type": "Public",
    "comment": "hii", "record_count": 2,
    "created_at": "2026-07-26T22:04:30", "updated_at": null}
   … ],
 "total": 4, "page": 1, "limit": 3, "pages": 2}
```

### 4.2 `POST /api/zones`

**Request body** — `ZoneCreate` (`schemas.py:51-69`):

| Field | Type | Default | Validation |
|---|---|---|---|
| `name` | string | required | Trimmed; **a trailing dot is appended if missing** (`schemas.py:56-62`) |
| `type` | string | `"Public"` | Must be `Public` or `Private` (`schemas.py:64-69`) |
| `comment` | string \| null | `null` | Free text |

**Side effect:** `seed_default_ns_soa` (`backend/app/routes/zones.py:24-25`) — *"Add default NS and SOA
records like Route53 does on zone creation"* — runs immediately, so `record_count` is
`2` on creation. **Statuses:** **201** created; **409** **this user** already has a zone
with this name (`zones.py:120-124`); **422** `name` missing, or `type` not Public/Private.
**Uniqueness is per-owner, not global** — the duplicate check filters on
`HostedZone.name == payload.name, HostedZone.owner_id == current_user.id`
(`backend/app/routes/zones.py:117`). I verified this holds in the live database: `civicvoice.xyz.` exists
twice, once owned by user 1 and once by user 2. Two tenants managing the same domain
name don't collide, which is the correct multi-tenant behaviour. The zone created in the
capture below was deleted afterwards:

```console
$ curl -b cookies.txt -X POST http://localhost:8000/api/zones -H "Content-Type: application/json" \
    -d '{"name":"interview-demo.test","type":"Public","comment":"scratch zone for docs"}'

{"id":7,"zone_id":"ZFR50R26FG9FFS","name":"interview-demo.test.","type":"Public",
 "comment":"scratch zone for docs","record_count":2,
 "created_at":"2026-07-29T04:44:16","updated_at":null}          # HTTP 201
```

`"interview-demo.test"` went in and `"interview-demo.test."` came out — Pydantic's
`name_must_end_with_dot` normalised it. Repeating the call returns
`{"detail":"Hosted zone 'interview-demo.test.' already exists"}` — **409**.

### 4.3 `GET /api/zones/{zone_id}`

`zone_id` is the integer PK, **not** the `Z...` display ID. Only status beyond the blanket
set: **200** when found and owned by the caller, returning a single `ZoneOut` — the same
shape as the items in §4.1 and the 201 body in §4.2. Zone 1 comes back as `{"id":1,"zone_id":"ZKB406Z10S64QY","name":"vprofile.in.","type":"Private",
"comment":"Internal app zone","record_count":2,"created_at":"2026-06-19T00:05:59",
"updated_at":"2026-06-19T01:51:35"}`. A non-integer path segment (`/api/zones/abc`) is a
Pydantic 422 with `type: "int_parsing"`, `loc: ["path","zone_id"]` — §2.4 shape.

### 4.4 `PUT /api/zones/{zone_id}`

Partial update. Only `comment` and `type` are mutable — `name` and `zone_id` are
immutable, matching Route 53 (a zone's domain name is its identity). **Request body** —
`ZoneUpdate` (`schemas.py:72-74`): both fields optional, both default `null`; a
`null`/omitted field means "leave unchanged" (`zones.py:174-179`). **Statuses:** **200**
updated; **400** `type` present but not Public/Private.
**Note the asymmetry:** `ZoneUpdate` has **no validators**, unlike `ZoneCreate`, so the
`Public`/`Private` check is re-done manually in the route — and returns **400**, not the
422 the create path gives:
`raise HTTPException(status_code=400, detail="type must be Public or Private")`
(`backend/app/routes/zones.py:176-178`).

> **Weakness → fix.** Same rule, two status codes and two error shapes depending on
> which endpoint you hit. Moving the check into a `ZoneUpdate` `@field_validator` —
> reusing `ZoneCreate`'s — would make both paths return 422 with an identical body and
> delete the duplicated logic.

Capture — scratch zone, deleted afterwards:

```console
$ curl -X PUT http://localhost:8000/api/zones/7 -H "Authorization: Bearer $TOK" \
    -H "Content-Type: application/json" \
    -d '{"comment":"Marketing + storefront zone","type":"Private"}'

{"id":7,"zone_id":"Z1WWV7BA2WDT91","name":"put-demo.test.","type":"Private",
 "comment":"Marketing + storefront zone","record_count":2,
 "created_at":"2026-07-29T04:46:30","updated_at":"2026-07-29T04:46:30"}   # HTTP 200
```

Sending `{"type":"Hybrid"}` gives `{"detail":"type must be Public or Private"}` — **400**
with a *string* detail, versus the 422 *list* the create path would give.

### 4.5 `GET /api/zones/{zone_id}/export`

Streams the zone in one of two formats, with a `Content-Disposition` header so the
browser saves it as a file. Params: `zone_id` (int, path) and `format` (string, query,
default `json`, constrained `^(json|bind)$`). Because the pattern is enforced in the
`Query` declaration (`zones.py:189`), an invalid `format` is a **422** before the handler
body runs; otherwise only **200**.
**Two response types from one handler.** FastAPI normally serialises the return value as
JSON via the `response_model`; here the handler returns explicit `Response` objects
instead — `JSONResponse` (`zones.py:231`) or `PlainTextResponse` (`zones.py:244`) —
which bypasses that machinery and lets one endpoint emit `application/json` or
`text/plain`. That's why this route declares **no** `response_model`. Captures below;
the BIND body is truncated at `…`:

```console
$ curl -D - -o /dev/null -b cookies.txt "http://localhost:8000/api/zones/1/export?format=json"
HTTP/1.1 200 OK
content-disposition: attachment; filename="vprofile.in.json"
content-type: application/json

$ curl -b cookies.txt "http://localhost:8000/api/zones/1/export?format=bind"
$ORIGIN vprofile.in.
$TTL 300

vprofile.in.                     172800  IN NS     ns-1.awsdns-1.com.
vprofile.in.                     172800  IN NS     ns-2.awsdns-2.net.
…
vprofile.in.                     900     IN SOA    ns-1.awsdns-1.com. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400
```

Three details worth knowing. The **multi-value NS record is one database row** — `value`
is newline-separated (`models.py:78`) — but BIND requires one line per value, so the
writer explodes it (`zones.py:241-242`); the JSON format does the inverse, splitting
`value` into an **array** (`zones.py:223`), the more natural JSON shape. Column alignment
comes from f-string padding, `f"{fqdn:<32} {ttl:<7} IN {r.type:<6}"` (`zones.py:242`), so
the file is human-readable and diffable. And the `Content-Disposition` header only reaches
the frontend because of `expose_headers=["Content-Disposition"]` in the CORS config
(`main.py:57`) — see `03-backend-overview.md` §8.

### 4.6 `DELETE /api/zones/{zone_id}`

**Refuses to delete a zone that still holds real records** — only the two Route
53-managed defaults may remain (`backend/app/routes/zones.py:264-271`):

```python
    # Only the default apex NS and SOA records may remain when deleting a zone.
    deletable = [r for r in zone.records
                 if not (r.type == "SOA" or (r.type == "NS" and r.name == zone.name))]
    if deletable:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, …)
```

**Why 409 rather than cascading?** The ORM *could* cascade —
`cascade="all, delete-orphan"` is on the relationship (`models.py:58`) and the FK has
`ondelete="CASCADE"` (`models.py:70`), so deleting is one line. The guard is a deliberate
product decision: (1) **it mirrors Route 53**, which returns `HostedZoneNotEmpty` for
exactly this, and fidelity is the requirement; (2) **DNS deletion is irreversible and
high-blast-radius** — silently destroying 40 records because someone clicked Delete takes
a production domain offline, so forcing "delete the records first" makes destruction a
two-step, intentional act; (3) **the cascade still exists as a safety net** — once the
guard passes, `db.delete(zone)` (`zones.py:278`) cleans up the remaining NS/SOA rows, and
I verified zero orphan records after my test deletions. **Statuses:** **204** deleted,
empty body; **409** zone still contains non-default records.

```console
$ curl -b cookies.txt -X DELETE http://localhost:8000/api/zones/7
{"detail":"Before you can delete a hosted zone, you must delete all records in it other than the default NS and SOA records."}   # HTTP 409
$ curl -b cookies.txt -X DELETE http://localhost:8000/api/zones/7   # after removing the records → HTTP 204, empty body
```

## 5. DNS-record endpoints

Auth: required on all seven. All seven live under
`APIRouter(prefix="/zones/{zone_id}/records")` (`records.py:25`), and all seven start
with the same ownership gate (`backend/app/routes/records.py:31-39`) — so **every one of them can return
404** for a zone that is missing or not yours:

```python
def get_zone_or_404(zone_id: int, db: Session, current_user: User) -> HostedZone:
    zone = (db.query(HostedZone)
            .filter(HostedZone.id == zone_id, HostedZone.owner_id == current_user.id)
            .first())
    if not zone:
        raise HTTPException(status_code=404, detail="Hosted zone not found")
    return zone
```

You cannot reach another tenant's records even by guessing a valid record ID — the zone
check fails first. The alias `ttl IS NULL` convention that runs through these endpoints
is in §2.6; the shared query parameters are in §2.3.

### 5.1 `GET /api/zones/{zone_id}/records`

Query parameters: the shared set in §2.3 — `search` (name *or* value), `type`,
`routing_policy`, `alias`, `page`, `limit`, `sort_by`, `sort_order`; sorting is stable
across pages thanks to the `id` tiebreaker. Only status beyond the blanket set:
**200**, always, even with zero matches. Capture, truncated to one item:

```console
$ curl -b cookies.txt "http://localhost:8000/api/zones/1/records?limit=5"

{"items": [
   {"id": 1, "zone_id": 1, "name": "vprofile.in.", "type": "NS", "ttl": 172800,
    "value": "ns-1.awsdns-1.com.\nns-2.awsdns-2.net.\nns-3.awsdns-3.co.uk.\nns-4.awsdns-4.org.",
    "routing_policy": "Simple", "comment": "Default NS record",
    "created_at": "2026-06-19T00:05:59", "updated_at": null}
   … ],
 "total": 2, "page": 1, "limit": 5, "pages": 1}
```

The `\n` inside the NS `value` is the multi-value encoding — one record set, four name
servers, one row. The elided second item is the zone's SOA, `ttl: 900`. The
`alias=Alias` filter against the scratch zone returned exactly one row,
`alias.interview-demo.test.` — the record created in §5.2.

### 5.2 `POST /api/zones/{zone_id}/records`

**Request body** — `RecordCreate` (`schemas.py:585-619`):

| Field | Type | Default | Validation |
|---|---|---|---|
| `name` | string | required | Lowercased, trailing dot enforced, ≤255 bytes, ≤63 bytes per label, wildcard only as leftmost label, no wildcard on NS |
| `type` | string | required | Uppercased; one of 16 types (`schemas.py:113-116`) — **`SOA` is not creatable** |
| `ttl` | int \| null | `300` | `0 ≤ ttl ≤ 2147483647`; **`null` means alias** (§2.6) |
| `value` | string | required | Newline-separated; per-type rules, or alias-target rules if `ttl` is null |
| `routing_policy` | string \| null | `"Simple"` | One of 8 (`schemas.py:135-138`) |
| `comment` | string \| null | `null` | Free text |

`VALID_RECORD_TYPES` (`schemas.py:113-116`) holds 16 types; the `RecordType` enum in
`models.py:13-30` holds 17 — the extra is `SOA`. That's intentional: Route 53 owns the
SOA, so it can't be created, but the validator still knows its format because a seeded
SOA can be reached by `PUT` (`schemas.py:468-469`).
**Then the route adds the
DB-dependent rules** — *"RecordCreate has already validated name, type and value; these
rules need the zone"*, `backend/app/routes/records.py:206-207`.
`check_record_set_conflicts` (`records.py:65-125`) enforces three things:

| Rule | Why | Captured **409** message, verbatim |
|---|---|---|
| No CNAME at the zone apex | The DNS protocol forbids it — apex must hold SOA/NS | `The DNS protocol doesn't allow a CNAME record at the zone apex (interview-demo.test). Create an alias record instead.` |
| A CNAME may not share a name with any other record | DNS: a CNAME is *the* answer for that name | `'www.interview-demo.test.' already has a A record. DNS doesn't allow a CNAME to share a name with any other record.` |
| One record set per `(zone, name, type)` | Route 53 keys record sets on name+type | `A A record for 'www.interview-demo.test.' already exists.` |

**Statuses:** **201** created; **409** any of the three conflict rules above; **422** any
schema-layer failure (bad rdata, TTL out of range, illegal name). Captures below, against
a scratch zone since deleted:

```console
$ curl -b cookies.txt -X POST http://localhost:8000/api/zones/7/records \
    -H "Content-Type: application/json" \
    -d '{"name":"www.interview-demo.test","type":"A","ttl":300,
         "value":"192.0.2.10\n192.0.2.11","comment":"web tier"}'

{"id":16,"zone_id":7,"name":"www.interview-demo.test.","type":"A","ttl":300,
 "value":"192.0.2.10\n192.0.2.11","routing_policy":"Simple","comment":"web tier",
 "created_at":"2026-07-29T04:44:26","updated_at":null}                    # HTTP 201
```

An **alias** record is the same call with `ttl: null` and an ELB hostname as `value` —
one that would fail the A-record IPv4 rule if the alias branch didn't take over:

```console
{"id":17,"zone_id":7,"name":"alias.interview-demo.test.","type":"A","ttl":null,
 "value":"dualstack.my-lb-1234567890.us-east-1.elb.amazonaws.com.",
 "routing_policy":"Simple","comment":null,
 "created_at":"2026-07-29T04:44:38","updated_at":null}                    # HTTP 201
```

All three **409** conflict bodies were captured; each is `{"detail": "<message>"}` with the
message printed verbatim in the table above. Invalid rdata is a
**422 with a list detail** (§2.4) —
`msg: "Value error, Enter a valid IPv4 address, for example 192.0.2.235."` — and its
`loc` is `["body"]`, **not** `["body","value"]`, because the check lives in a
`@model_validator` (the whole model) rather than a `@field_validator`. A frontend
highlighting the offending input field must special-case that. A TTL above the maximum
is the `less_than_equal` error printed in §2.4.

### 5.3 `GET /api/zones/{zone_id}/records/{record_id}`

Only status beyond the blanket set: **200** when found. The record query filters on
**both** IDs (`records.py:232-234`), so a record from zone A cannot be read through
zone B — that's a **404** (`records.py:236`), same body as a missing zone.

### 5.4 `PUT /api/zones/{zone_id}/records/{record_id}`

The most intricate handler in the codebase (`records.py:240-294`). **Request body** —
`RecordUpdate` (`schemas.py:622-638`): every field optional, omitted means unchanged, and
**there is no `type` field — a record's type is immutable.** Four things happen in order.

**1. Protected-record guard** (`is_protected_record(record, zone)`,
`backend/app/routes/records.py:255-257`) — *"DELETE already refuses the Route 53-managed
apex NS/SOA; renaming or rewriting one is just as destructive, so PUT has to refuse them
too."*

**2. Name re-validated with the stored type** (`backend/app/routes/records.py:263-264`) — *"RecordUpdate
normalises the name without knowing the type, so the NS-wildcard rule is re-run here now
that the stored type is available."*

**3. TTL resolved, then used to pick the value validator** — the subtle bit
(`backend/app/routes/records.py:272-274`):

```python
    # RecordUpdate can't express "clear the TTL", so an omitted TTL keeps the stored one.
    # The resulting TTL is what decides whether `value` is an alias target or rdata.
    new_ttl = record.ttl if payload.ttl is None else payload.ttl
```

> **Weakness (documented in the code) → fix.** Because `ttl: null` means *"omitted"* in
> `RecordUpdate`, there is **no way to convert an existing record into an alias** via
> PUT — you can't distinguish "I didn't send a TTL" from "set the TTL to null". Delete
> and recreate is the workaround. The clean fix is a sentinel: a `Literal["unset"]`
> default, or JSON-Merge-Patch semantics, or an explicit `is_alias` boolean.

**4. Conflict re-check only on rename** — a rename moves the record into a different
record set, so the CNAME/uniqueness rules must run again (`records.py:280-282`).
**Statuses:** **200** updated; **409** protected apex NS/SOA, or the rename collides;
**422** bad name or bad value (route-raised, **string** detail) versus bad TTL (Pydantic,
**list** detail) — see §2.4.

```console
$ curl -b cookies.txt -X PUT http://localhost:8000/api/zones/7/records/16 \
    -H "Content-Type: application/json" -d '{"ttl":600,"value":"192.0.2.20"}'

{"id":16,"zone_id":7,"name":"www.interview-demo.test.","type":"A","ttl":600,
 "value":"192.0.2.20","routing_policy":"Simple","comment":"web tier",
 "created_at":"2026-07-29T04:44:26","updated_at":"2026-07-29T04:44:38"}   # HTTP 200
```

`updated_at` flipped from `null` to a timestamp — that's `onupdate=func.now()` on the
column (`models.py:82`), not application code. Attempting the same `PUT` against the
seeded NS record (id 14) returns
`{"detail":"The default NS and SOA records cannot be modified."}` — **409**.

### 5.5 `DELETE /api/zones/{zone_id}/records/{record_id}`

**Statuses:** **204** deleted, empty body; **409** protected apex NS/SOA
(`records.py:311-315`), captured as
`{"detail":"The default NS and SOA records cannot be deleted."}` — see the bulk-delete
capture in §5.6 for the same body. The delete and update guards share one constant each (`records.py:27-28`), so the
message can't drift between the two paths — and the tests import those constants
directly (`test_records_routes.py:27`) rather than hard-coding the strings.

### 5.6 `DELETE /api/zones/{zone_id}/records?ids=1,2,3` — bulk delete

**A design choice worth defending in an interview.** The signature is
`ids: str = Query(..., description="Comma-separated record IDs")`
(`backend/app/routes/records.py:322-325`); the literal `...` (Python's `Ellipsis`) means
**required**, so omitting `ids` is a 422.
**Why a CSV query param rather than a JSON body?** Because HTTP `DELETE` with a request
body is poorly defined: RFC 9110 says a body has no defined semantics for DELETE, and
various proxies, CDNs and HTTP clients strip it. `fetch()` in some browsers refuses to
send one. A query parameter is unambiguously transported by everything. **The honest
counter-arguments — say these before the interviewer does:** **URL length** — practical
limits are ~2,000 characters, so this caps out around 200–300 IDs, and a "select all" over
a large zone would silently truncate or 414; **IDs leak into logs** — query strings appear
in access logs and browser history in a way bodies don't (harmless for record IDs, would
matter for anything sensitive); and **the REST-purist alternative**,
`POST /records/bulk-delete` with a JSON array, loses DELETE's semantic clarity but scales.

**The all-or-nothing guard.** If *any* selected record is protected, the whole batch is
rejected and nothing is deleted — *"Refuse if any selected record is a protected default
NS/SOA"*, `if any(is_protected_record(r, zone) for r in records)`
(`backend/app/routes/records.py:342-343`).
IDs which don't exist, or belong to another zone, are **silently ignored** — the query
filters by `zone_id` (`records.py:337-340`) and simply returns fewer rows. So this
endpoint is idempotent, but it also can't tell you "3 of your 5 IDs didn't exist."
**Statuses:** **204** deleted, even if zero rows matched; **400** `ids` contains a
non-integer (`records.py:335`); **409** any selected record is a protected apex NS/SOA;
**422** `ids` omitted entirely. All three route-specific outcomes, captured:

```console
$ curl -b cookies.txt -X DELETE "http://localhost:8000/api/zones/7/records?ids=16,17,18,19"
# HTTP 204, empty body
$ curl -b cookies.txt -X DELETE "http://localhost:8000/api/zones/7/records?ids=14,16"
{"detail":"The default NS and SOA records cannot be deleted."}            # HTTP 409
$ curl -b cookies.txt -X DELETE "http://localhost:8000/api/zones/7/records?ids=1,abc"
{"detail":"ids must be comma-separated integers"}                         # HTTP 400
```

### 5.7 `POST /api/zones/{zone_id}/records/import` — BIND zone-file import

**The most interesting endpoint in the API**, and the best one to volunteer in an
interview. **Request body** — `ImportZoneRequest` (`schemas.py:664-665`): one field,
`zone_file`, the raw text. **Response** — `ImportZoneResponse` (`schemas.py:668-672`):
`{created: int, updated: int, skipped: int, errors: List[str] = []}`.

**It returns 200 even when some records fail.** That is the design decision, and the
comment at `backend/app/routes/records.py:386-387` states it: *"The parser reads syntax, not Route 53's
rules, so run every line through the same validators POST uses. One bad line is skipped
and reported; the rest import."* **Why partial success beats all-or-nothing**, and the non-atomicity trade-off that buys
it — mitigated by the **upsert** on `(zone_id, name, type)` (`records.py:400-411`) — are
argued in full in §7 Q5.

**Records that never import:**

| Skipped | Why | `file:line` |
|---|---|---|
| `SOA` and apex `NS` | Route 53 manages them; the zone already has its own | `records.py:378-380` |
| Types outside `VALID_RECORD_TYPES` | Unsupported; reported in `errors` | `records.py:381-383` |
| Anything failing the API's own validators | Same rules `POST` enforces | `records.py:388-398` |
| An existing record that is protected | Can't be overwritten | `records.py:406-408` |

**Statuses:** **200** always, whatever the mix of created/updated/skipped; **422**
`zone_file` missing from the body. **The capture below is the single best example in the
file** — it deliberately includes an SOA to skip, a multi-line record set, one invalid IP
and one unsupported type:

```console
$ curl -b cookies.txt -X POST http://localhost:8000/api/zones/7/records/import \
    -H "Content-Type: application/json" \
    -d '{"zone_file": "$ORIGIN interview-demo.test.\n$TTL 300\n@       3600 IN SOA  ns-1.awsdns-1.com. host.example.com. 1 7200 900 1209600 86400\napi     60   IN A    192.0.2.30\n             60   IN A    192.0.2.31\nmail    3600 IN MX   10 mail1.example.com.\nbroken  300  IN A    not-an-ip\nweird   300  IN XYZ  whatever\n"}'
```
```json
{
  "created": 2,
  "updated": 0,
  "skipped": 3,
  "errors": [
    "Skipped broken.interview-demo.test. (A): Enter a valid IPv4 address, for example 192.0.2.235.",
    "Skipped unsupported record type XYZ for weird.interview-demo.test."
  ]
}
```
> HTTP **200**

Unpacking that result line by line:

- **`created: 2`** — `api` (an **A record set with two values**, merged from two source
  lines into one row) and `mail` (MX).
- **`skipped: 3`** — the SOA (Route 53-managed), `broken` (invalid IPv4), `weird`
  (unsupported type).
- **`errors` has only 2 entries** for 3 skips: the SOA skip is *expected* and therefore
  silent, while the two genuine problems are reported.
- The indented second `api` line demonstrates **RFC 1035 owner-name inheritance** — a
  line starting with whitespace reuses the previous owner name. That's the exact
  behaviour a regression test was written for (`test_bind_parser.py:3-6`).
