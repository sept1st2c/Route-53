# 01 — Project Overview

> ### TL;DR — the 5 things you must be able to say
>
> 1. **A hosted zone is a folder for one domain; a DNS record is an entry inside it.** Everything in this project is CRUD on those two nouns.
> 2. **Three layers:** Next.js in the browser → FastAPI over JSON with a JWT cookie → SQLite through SQLAlchemy.
> 3. **19 endpoints, 3 tables, 5 contexts, 226 tests.** Have the numbers ready.
> 4. **It does not resolve real DNS.** It's the control plane — say this in the first minute, framed as a scoping decision.
> 5. **`ttl IS NULL` marks an alias record** — the design choice that caused the project's nastiest bug.
>
> **Read all of it (~15 min)**, except the repo tree under 🔎 Reference, which is for looking up.

> **Read this first.** Everything else in this folder zooms in on one layer. This file is the map.

---

## 1. What is AWS Route 53, in one paragraph?

The internet runs on IP addresses (`52.94.236.248`), but humans use names
(`amazon.com`). **DNS** — the Domain Name System — is the phone book that translates
one into the other. **Route 53** is Amazon's managed DNS service. You give it your
domain, it gives you a place to store the "phone book entries" for that domain, and
its servers answer lookups for you.

Two nouns do almost all the work:

| Term | Plain English | Real example |
| --- | --- | --- |
| **Hosted zone** | A folder that holds all the DNS entries for one domain. | `example.com` |
| **DNS record** | One entry inside that folder: "this name, of this type, points at this value." | `www.example.com` → `A` → `192.0.2.1` |

That's the whole mental model. A hosted zone is a container; records are the rows
inside it. Everything in this project is CRUD on those two things, wrapped in a UI
that looks and behaves like the real AWS console.

> **MERN analogy:** hosted zone ≈ a MongoDB collection for one domain, DNS record ≈ a
> document inside it. One-to-many, exactly like `User` → `Post`.

### What the record types mean

You'll be asked. Here are the ones that matter, in plain terms:

| Type | What it does | Example value |
| --- | --- | --- |
| `A` | Name → IPv4 address | `192.0.2.1` |
| `AAAA` | Name → IPv6 address | `2001:db8::1` |
| `CNAME` | Name → *another name* (an alias) | `www` → `example.com.` |
| `MX` | Where to deliver email for this domain | `10 mail.example.com.` |
| `TXT` | Free-form text; used for domain verification, SPF | `"v=spf1 include:_spf.google.com ~all"` |
| `NS` | Which name servers are authoritative for this zone | `ns-1.awsdns-00.com.` |
| `SOA` | "Start of Authority" — metadata about the zone itself | `ns-1.awsdns-00.com. admin.example.com. 1 7200 900 1209600 86400` |
| `SRV` | Service location: port + host for a named service | `10 5 5060 sip.example.com.` |
| `CAA` | Which certificate authorities may issue certs for this domain | `0 issue "amazon.com"` |
| `PTR` | Reverse lookup: IP → name | `host.example.com.` |

Two details that come up constantly in this codebase:

- **The trailing dot.** `example.com.` with a dot at the end is a *fully qualified*
  name — absolute, like `/home/user` in a filesystem. Without the dot it's relative
  to the zone. The backend normalises names to always carry the trailing dot.
- **TTL** (Time To Live) is how many seconds a resolver may cache the answer.
  `300` = five minutes. In *this* codebase `ttl` doubles as a flag — see §5.

---

## 2. What the assignment asked for, and what we built

The brief: build a functional clone of the Route 53 console. Authentication,
hosted-zone CRUD, DNS-record CRUD, persistent storage, a real API, and a UI that
mirrors the AWS console. Optional bonuses on top.

| Requirement | Where it lives |
| --- | --- |
| Mock login / logout / session persistence | `backend/app/routes/auth.py`, `frontend/src/context/AuthContext.tsx` |
| Hosted zones — list, create, edit, delete | `backend/app/routes/zones.py`, `frontend/src/app/hosted-zones/` |
| DNS records — list, create, edit, delete, bulk delete | `backend/app/routes/records.py`, `frontend/src/app/hosted-zones/[id]/records/` |
| Record types A/AAAA/CNAME/TXT/MX/NS/PTR/SRV/CAA | `backend/app/schemas.py` (validators), `frontend/src/lib/dnsValidation.ts` |
| Persistent storage | SQLite via SQLAlchemy — `backend/app/models.py` |
| Search / filter / sort / paginate | Server-side, in both route files |
| Console-accurate UI | `frontend/src/components/layout/AppShell.tsx` |
| **Bonus:** import a BIND zone file | `backend/app/services/bind_parser.py` |
| **Bonus:** export a zone (JSON + BIND) | `GET /api/zones/{id}/export` |
| **Bonus:** keyboard shortcuts | `frontend/src/lib/useHotkey.ts` |
| **Bonus:** dark mode | `frontend/src/context/ThemeContext.tsx` |
| **Bonus:** tests | `backend/tests/` — 226 of them |

**What we deliberately did *not* build:** actual DNS resolution. Nothing in this repo
answers a real DNS query on port 53. It stores and manages records exactly the way
Route 53 does, but it is not a name server. Say this early in an interview — it's a
scoping decision, not an omission, and stating it up front reads as confidence.

---

## 3. The three layers

```
┌──────────────────────────────────────────────────────────────┐
│  BROWSER                                                     │
│  Next.js 15 App Router · React 19 · TypeScript               │
│  Pages, contexts, forms, tables                              │
└───────────────────────────┬──────────────────────────────────┘
                            │  HTTPS + JSON
                            │  JWT in an httpOnly cookie
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  API                                                         │
│  FastAPI (Python) · Pydantic validation · JWT auth           │
│  19 endpoints under /api                                     │
└───────────────────────────┬──────────────────────────────────┘
                            │  SQLAlchemy ORM
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  DATABASE                                                    │
│  SQLite — one file, three tables                             │
│  users · hosted_zones · dns_records                          │
└──────────────────────────────────────────────────────────────┘
```

### The equivalent stack you already know

| This project | Your MERN world |
| --- | --- |
| FastAPI | Express |
| Pydantic | Zod / Joi — but wired into the framework, not called manually |
| SQLAlchemy | Mongoose (an ORM instead of an ODM) |
| SQLite | MongoDB — except it's one file on disk, not a server |
| `Depends()` | Express middleware, but per-route and typed |
| Uvicorn | `node server.js` |
| `requirements.txt` | `package.json` |
| `venv/` | `node_modules/` |

---

## 4. One request, traced end to end

Take the most representative action in the app: **loading the hosted-zones list.**

```
1.  User navigates to /hosted-zones
        frontend/src/app/hosted-zones/page.tsx

2.  A React effect calls the service layer
        zoneService.list({ search, page, limit, sortBy, sortOrder })
        frontend/src/lib/services.ts

3.  The service maps camelCase → the API's snake_case and calls axios
        GET /api/zones?search=&page=1&limit=10&sort_by=name&sort_order=asc
        frontend/src/lib/api.ts   ← axios instance + interceptors

4.  The browser attaches the JWT cookie automatically (withCredentials: true)

5.  FastAPI matches the route
        @router.get("")  in backend/app/routes/zones.py:65

6.  Two dependencies resolve BEFORE the handler body runs:
        get_db()            → opens a SQLAlchemy session
        get_current_user()  → decodes the JWT, loads the User row, 401s if bad

7.  The handler builds a query scoped to that user:
        db.query(HostedZone).filter(HostedZone.owner_id == current_user.id)
        …then applies search, sort, LIMIT/OFFSET

8.  SQLAlchemy emits SQL; SQLite reads route53.db from disk

9.  Rows come back as HostedZone objects; FastAPI serialises them through the
    ZoneListResponse Pydantic model — which also strips anything not declared

10. JSON goes back over the wire

11. The page sets state; the Cloudscape table re-renders with the new rows,
    the total count, and the current page
```

Steps 6 and 9 are the two that have no direct Express equivalent, and they're the two
worth being able to explain. See [03-backend-overview.md](03-backend-overview.md).

---

## 5. Five design decisions worth defending

These come up because they're *choices*, not defaults. Each has a fuller treatment
later in this folder.

**a) Server-side search, sort and pagination.** The table never receives the full
dataset. Filtering happens in SQL, so sorting applies to the whole zone rather than
whatever page you happen to be looking at. Costs a round trip per interaction; buys
correctness and constant memory on the client.

**b) `ttl IS NULL` marks an alias record.** Route 53 alias records don't have a TTL —
the TTL comes from whatever they point at. Rather than adding an `is_alias` boolean,
the schema uses "TTL is absent" as the signal. Compact, and it mirrors the real API.
It also caused one of the nastiest bugs in the project — see
[07-bugs-and-debugging.md](07-bugs-and-debugging.md).

**c) Validation is split across two layers on purpose.** Pydantic handles anything
decidable from the request payload alone ("is this a valid IPv4?"). The route layer
handles anything that needs to look at *another row* ("does a CNAME already exist at
this name?"). A schema can't run a query, so trying to do it all in one place would
be wrong.

**d) Multi-tenancy by `owner_id`, and foreign resources return 404 rather than 403.**
A 403 says "this exists, you can't have it." A 404 says nothing. That's the correct
choice for tenant isolation.

**e) React Context instead of Redux.** Five small contexts, no global store, no
React Query. For an app this size that's less machinery for the same result — and
knowing *when that stops being true* is the interesting half of the answer.

---

## 7. Where to go next

*§6 is the repository tree — an inventory, so it lives below the fold.*

| You want to understand… | Read |
| --- | --- |
| The tables, columns, and what's enforced where | [02-database.md](02-database.md) |
| FastAPI itself, taught against Express | [03-backend-overview.md](03-backend-overview.md) |
| Every endpoint with a working example | [04-backend-apis.md](04-backend-apis.md) |
| The Next.js structure, contexts and theming | [05-frontend-overview.md](05-frontend-overview.md) |
| Hooks and the four CRUD flows | [06-frontend-crud.md](06-frontend-crud.md) |
| The bugs — the best material you have | [07-bugs-and-debugging.md](07-bugs-and-debugging.md) |
| Login, JWT, cookies, tenancy | [09-auth-and-security.md](09-auth-and-security.md) |
| Hosting, env vars, and the test suite | [10-deployment-and-testing.md](10-deployment-and-testing.md) |
| Rehearsal questions | [08-interview-qa.md](08-interview-qa.md) |

---

## If they ask…

**"Why SQLite and not Postgres?"**
The assignment specified it, and for a single-writer demo app it's genuinely the right
call — zero setup, one file, full SQL. It becomes wrong the moment you need concurrent
writers or a hosted deployment with durable storage, which is exactly the limitation we
hit on Render's free tier. Because everything goes through SQLAlchemy, switching to
Postgres is a `DATABASE_URL` change plus a real migration tool.

**"Why FastAPI and not Django or Flask?"**
Automatic request validation from type hints and free interactive API docs. Django
brings an admin and an auth system we didn't need; Flask would have meant hand-writing
what Pydantic gives for nothing.

**"Is this a real DNS server?"**
No, and deliberately not. It's the control plane — the part you'd use to *manage*
records. Serving actual lookups on UDP port 53 is a different problem entirely and
wasn't in scope.

**"What would you do differently?"**
Turn on `PRAGMA foreign_keys`, add a real migration tool instead of the hand-rolled
`ALTER TABLE` in `main.py`, add a unique constraint at the database level instead of
checking in Python, and add frontend tests — right now all 226 tests are backend-only.
Details in [02-database.md](02-database.md) and [10-deployment-and-testing.md](10-deployment-and-testing.md).


---

# 🔎 Reference — do not read this linearly

The full repository tree, one line per file. Ctrl-F it when you need to find where
something lives; skip it on a read-through.

---

## 6. Repository tree

Only tracked files. Screenshots under `frontend/uiss/` are AWS console references
used while matching the UI, and are omitted here.

```
route53-clone/
├── README.md                        Project readme (the submitted one)
├── render.yaml                      Render Blueprint — deploys the backend
├── .gitignore
│
├── backend/
│   ├── requirements.txt             Python dependencies
│   ├── Procfile                     Start command for the host
│   ├── .env.example                 Env template (SECRET_KEY etc.)
│   ├── .python-version
│   │
│   ├── app/
│   │   ├── main.py                  App entry: CORS, routers, startup hooks, health
│   │   ├── database.py              Engine, SessionLocal, Base, get_db()
│   │   ├── models.py                SQLAlchemy tables: User, HostedZone, DNSRecord
│   │   ├── schemas.py               Pydantic request/response models + all validators
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.py              login, register, logout, me   (4 endpoints)
│   │   │   ├── zones.py             hosted-zone CRUD + export     (6 endpoints)
│   │   │   └── records.py           record CRUD + bulk + import   (7 endpoints)
│   │   │
│   │   └── services/
│   │       ├── bind_parser.py       Parses BIND zone-file text into records
│   │       └── demo_seed.py         Seeds demo zones on a fresh database
│   │
│   └── tests/                       226 tests
│       ├── test_schemas.py          48 — validators
│       ├── test_demo_seed.py        26 — seeding is idempotent & correct
│       ├── test_records_routes.py   24 — route-layer rules (protected NS/SOA, CNAME)
│       └── test_bind_parser.py       8 — the parser bug, pinned
│
└── frontend/
    ├── package.json
    ├── next.config.ts · tsconfig.json · tailwind.config.ts · postcss.config.mjs
    ├── public/brand/                Logos
    │
    └── src/
        ├── app/                     App Router — one folder per route
        │   ├── layout.tsx           Root layout + the pre-paint dark-mode script
        │   ├── providers.tsx        All five context providers, nested
        │   ├── globals.css          Tailwind + CSS custom properties
        │   ├── page.tsx             / — redirects
        │   ├── login/ · signup/     Auth pages
        │   ├── dashboard/           Landing page after sign-in
        │   ├── hosted-zones/
        │   │   ├── page.tsx                     List (search, sort, paginate)
        │   │   ├── create/page.tsx              Create zone
        │   │   └── [id]/
        │   │       ├── edit/page.tsx            Edit zone
        │   │       ├── import/page.tsx          Import a BIND zone file
        │   │       ├── query-logging/page.tsx   Coming soon
        │   │       ├── test-record/page.tsx     Coming soon
        │   │       └── records/
        │   │           ├── page.tsx             Record list + bulk delete
        │   │           └── create/page.tsx      Create record
        │   ├── health-checks/ · profiles/ · resolver/ · traffic-policies/
        │   │                             Console-parity pages (Coming soon)
        │   │
        ├── components/
        │   ├── layout/              AppShell, TopNav, ConsoleSideNav, footer, drawers
        │   ├── ui/                  Button, Modal, Flashbar, TagEditor, shortcuts modal
        │   ├── records/RecordForm.tsx   Shared create/edit record form
        │   └── brand/AwsLogo.tsx
        │
        ├── context/                 The five contexts
        │   ├── AuthContext.tsx      user, login, logout, loading
        │   ├── ThemeContext.tsx     light/dark
        │   ├── NotificationContext.tsx  toasts
        │   ├── DrawerContext.tsx    split panel + right-side drawers
        │   └── ShortcutsContext.tsx keyboard shortcuts modal
        │
        ├── lib/
        │   ├── api.ts               axios instance, interceptors, apiError()
        │   ├── services.ts          zoneService / recordService / authService
        │   ├── dnsValidation.ts     Client-side record validation (mirrors the backend)
        │   ├── routingPolicies.ts   Routing-policy metadata
        │   ├── awsTheme.ts          AWS orange applied to the design tokens
        │   ├── useHotkey.ts         The keyboard-shortcut hook
        │   └── auth.ts              ⚠️ dead code — nothing imports it
        │
        └── types/index.ts           Shared TypeScript types
```

**Counts to have ready:** 111 tracked files · 20 backend · 88 frontend (55 of those
are reference screenshots) · 19 API endpoints · 3 tables · 226 tests · 5 contexts.
