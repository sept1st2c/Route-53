# Route 53 Clone

A functional clone of the **AWS Route 53** console with persistent storage and a real backend API. The focus is on faithfully recreating the Route 53 **user experience and core workflows** (hosted zones and DNS records) rather than implementing actual DNS resolution.

> Records are stored and managed exactly like Route 53 manages them, but no DNS queries are ever served — this is a UI/UX + CRUD clone, not a name server.

---

## Live demo

| | |
| --- | --- |
| **Console** | https://route-53.vercel.app |
| **API** | https://route53-clone-api-zgy9.onrender.com |
| **API docs** | https://route53-clone-api-zgy9.onrender.com/api/docs |

```
Email:    demo@route53.aws
Password: Demo1234!
```

The sign-in form offers these credentials directly, so there is nothing to type.

> **First request may take ~40 seconds.** The API runs on Render's free plan, which
> idles the service after inactivity and cold-starts it on the next request. Once
> awake it responds normally. That plan also has an ephemeral filesystem, so the
> SQLite database is recreated on each deploy or wake — the demo account is
> re-seeded with sample hosted zones automatically, but anything you create
> yourself will not survive an idle period.

---

## Tech Stack

| Layer     | Technology                          |
| --------- | ----------------------------------- |
| Frontend  | Next.js 15 (App Router) + TypeScript + Tailwind CSS |
| UI        | [AWS Cloudscape Design System](https://cloudscape.design/) — the same component library the real console is built from |
| Backend   | FastAPI (Python)                    |
| Database  | SQLite (via SQLAlchemy ORM)         |
| Auth      | JWT in an httpOnly cookie (mocked AWS sign-in) |
| Tests     | pytest (backend), Playwright-driven verification (frontend) |

### Why Cloudscape — and where it is deliberately *not* used

The console shell and every data screen use real Cloudscape components (`AppLayoutToolbar`,
`Table`, `CollectionPreferences`, `SplitPanel`, `SideNavigation`, `BreadcrumbGroup`, `Form`,
`FormField`, `Tiles`, `TagEditor`, `AttributeEditor`, `KeyValuePairs`, …) rather than
hand-rolled lookalikes, so behaviour — sorting, resizable columns, column visibility,
split-panel docking, inline validation — matches the console instead of imitating it.

Two areas are intentionally hand-built, because Cloudscape would be *less* accurate:

- **The AWS sign-in / sign-up pages** use AWS's older standalone auth UI, not Cloudscape.
- **The global top navigation** (account menu, Region picker, search, Amazon Q) is AWS's own
  console header, not a Cloudscape component.

---

## Features

### Authentication (mocked)
- Email/password **login** and **logout**
- **Sign-up** for new accounts (multi-tenant — each account only sees its own zones)
- **Session persistence** via a JWT stored in an httpOnly cookie (survives refresh)
- A pre-seeded **demo account** (see [Demo credentials](#demo-credentials))

### Hosted Zones — full CRUD
- View, search, create, edit, and delete hosted zones
- Public / Private zone types
- New zones are auto-seeded with default apex **NS** and **SOA** records (like Route 53)
- Deletion is blocked while non-default records remain (matches Route 53 behavior)

### DNS Records — full CRUD
- View, search (by name **and** value), create, edit, delete, and **bulk-delete**
- Supported types: **A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA** (plus SPF, NAPTR, DS, TLSA, SSHFP, HTTPS, SVCB, SOA)
- The managed apex NS/SOA records are protected from deletion
- CNAME uniqueness is enforced per name

### Route 53 experience
- Console shell via Cloudscape **`AppLayoutToolbar`** — hamburger, breadcrumbs and drawer
  triggers share one toolbar row, exactly as the console does
- **Side navigation** with collapsible sections and exclusive active highlighting
- **Tables** with real column **sorting** and **resizable columns**, row selection, and a
  **Preferences** modal (page size, wrap lines, search mode, per-column visibility) whose
  choices persist in `localStorage`
- **Split panel** for row details, dockable **right or bottom** through its own preferences
  modal; details reflow into three columns when docked at the bottom
- Two right-side **drawers**: Info (help) and Operational troubleshooting
- **Forms** with genuine **per-field inline validation** (red border + message under the
  offending field), not a single generic error at the bottom
- **Search**, **filters** (type / routing policy / alias), and **pagination** — all resolved
  **server-side**, so sorting and filtering apply to the whole zone rather than the current page
- **Modals** for destructive confirmations and **toast notifications**
- All data persists in SQLite

### Mocked sections ("Coming Soon")
Dashboard · Traffic Policies · Health Checks · Resolver · Profiles

Also surfaced honestly rather than faked, because each needs an AWS service this clone has no
counterpart for: the **Accelerated recovery**, **DNSSEC signing** and **Hosted zone tags** tabs;
**query logging** (needs CloudWatch Logs); and the seven non-Simple **routing policies**, which
are listed for fidelity but disabled, since there is nowhere to store the Weight / Record ID /
failover role / Region they require. Nothing pretends to succeed and no user input is silently
discarded.

### Bonus features
| Bonus                       | Status |
| --------------------------- | ------ |
| Import DNS records from BIND zone files | ✅ Implemented (paste a zone file; SOA/apex-NS are skipped, duplicates merged) |
| Export as JSON / BIND       | ✅ Implemented ("Export zone file" on the records page — downloads all records as a BIND zone file or JSON) |
| Dark mode                   | ✅ Implemented (persisted in `localStorage`) |
| Bulk operations             | ✅ Implemented — multi-select delete for DNS records (the console selects hosted zones one at a time, with a radio, so that table matches it) |
| Keyboard shortcuts          | ✅ Implemented — `?` shortcuts reference, `Alt+S` focus top search, `/` focus page filter, `c` create, `Esc` close any modal/menu |

---

## Project Structure

```
route53-clone/
├── backend/
│   └── app/
│       ├── main.py            # FastAPI app, CORS, startup, migrations, health
│       ├── database.py        # SQLAlchemy engine / session / Base
│       ├── models.py          # User, HostedZone, DNSRecord
│       ├── schemas.py         # Pydantic request/response models
│       ├── routes/
│       │   ├── auth.py        # login / register / logout / me
│       │   ├── zones.py       # hosted zone CRUD
│       │   └── records.py     # record CRUD + bulk delete + import
│       └── services/
│           └── bind_parser.py # BIND zone file parser
└── frontend/
    └── src/
        ├── app/               # Next.js routes (pages)
        ├── components/        # layout, ui, records, brand
        ├── context/           # Auth, Theme, Notification, Drawer
        ├── lib/               # api client + services
        └── types/             # shared TypeScript types
```

---

## Setup Instructions

### Prerequisites
- **Python 3.10+**
- **Node.js 18+**

### 1. Backend (FastAPI)

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

Create `backend/.env` (optional — sensible defaults are used if omitted):

```env
DATABASE_URL=sqlite:///./route53.db
SECRET_KEY=change-me-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

Copy `backend/.env.example` as a starting point. For a deployment also set:

```env
ENVIRONMENT=production                       # session cookie -> SameSite=None; Secure
ALLOWED_ORIGINS=https://your-frontend.example # comma-separated CORS allowlist
```

Both matter once the frontend and API sit on different domains: a `SameSite=Lax` cookie is not
sent on cross-site requests, and the CORS allowlist otherwise only contains localhost.

Run the API:

```bash
uvicorn app.main:app --reload --port 8000
```

- API base: `http://localhost:8000/api`
- Interactive docs (Swagger): `http://localhost:8000/api/docs`
- The SQLite DB and tables are created automatically on first run, and a demo user is seeded.

### 2. Frontend (Next.js)

```bash
cd frontend
npm install
```

Create `frontend/.env.local` (optional — defaults to localhost:8000):

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Run the dev server:

```bash
npm run dev
```

Open **http://localhost:3000**.

### Running the tests

```bash
cd backend
venv\Scripts\activate          # macOS/Linux: source venv/bin/activate
pytest -q
```

Covers the BIND zone-file parser and the record schema validators. The parser suite locks in a
real defect: because the folded logical line was stripped before its indentation was checked,
RFC 1035 owner-name inheritance never applied, and a continuation line such as

```
www   IN A   192.0.2.1
      IN A   192.0.2.2
```

imported its second value under a record literally named `IN.example.com.`.

Type-check the frontend with:

```bash
cd frontend && npx tsc --noEmit
```

### Demo credentials

```
Email:    demo@route53.aws
Password: Demo1234!
```

Or create a new account from the sign-up page.

---

## Architecture Overview

```
┌─────────────────────────┐         ┌──────────────────────────┐         ┌──────────┐
│   Next.js (App Router)  │  HTTPS  │       FastAPI            │   ORM   │  SQLite  │
│  React Server/Client    │ ──────► │  /api/auth  /api/zones   │ ──────► │ route53  │
│  Tailwind UI + Context  │ ◄────── │  /api/.../records        │ ◄────── │   .db    │
└─────────────────────────┘  JSON   └──────────────────────────┘         └──────────┘
```

- **Frontend** — Next.js App Router. A thin Axios client (`lib/api.ts`) wraps the API; typed service modules (`lib/services.ts`) expose `authService`, `zoneService`, `recordService`. React Context provides auth state, theme, notifications, and the split-panel drawer. Tailwind + CSS variables (`--rz-*`) drive the AWS look and dark mode.
- **Backend** — FastAPI with three routers (auth, zones, records). Auth issues a JWT and sets it as an httpOnly cookie; protected endpoints resolve the current user from the cookie or `Authorization: Bearer` header. Every zone/record query is scoped to the authenticated owner, so accounts are isolated.
- **Database** — SQLAlchemy ORM over SQLite. Tables are created on startup; a lightweight in-code migration adds the `owner_id` column to existing databases.

---

## Database Schema

### `users`
| Column          | Type     | Notes                          |
| --------------- | -------- | ------------------------------ |
| id              | INTEGER  | PK                             |
| email           | STRING   | unique, indexed, not null      |
| hashed_password | STRING   | bcrypt hash                    |
| full_name       | STRING   | nullable                       |
| created_at      | DATETIME | server default `now()`         |

### `hosted_zones`
| Column       | Type     | Notes                                         |
| ------------ | -------- | --------------------------------------------- |
| id           | INTEGER  | PK                                            |
| owner_id     | INTEGER  | FK → `users.id` (CASCADE), indexed            |
| zone_id      | STRING   | unique Route 53-style ID (e.g. `Z1D633PJN98FT9`) |
| name         | STRING   | indexed, not null (stored with trailing dot)  |
| type         | STRING   | `Public` / `Private` (default `Public`)       |
| comment      | TEXT     | nullable (the "Description")                  |
| private_zone | STRING   | flag (`No` default)                           |
| created_at   | DATETIME | server default `now()`                        |
| updated_at   | DATETIME | on update                                     |

`record_count` is a computed property (count of related records).

### `dns_records`
| Column         | Type     | Notes                                            |
| -------------- | -------- | ------------------------------------------------ |
| id             | INTEGER  | PK                                               |
| zone_id        | INTEGER  | FK → `hosted_zones.id` (CASCADE), not null       |
| name           | STRING   | not null                                         |
| type           | STRING   | record type (A, AAAA, CNAME, …)                  |
| ttl            | INTEGER  | nullable (default 300)                           |
| value          | TEXT     | newline-separated for multi-value records        |
| routing_policy | STRING   | default `Simple`                                 |
| comment        | TEXT     | nullable                                         |
| created_at     | DATETIME | server default `now()`                           |
| updated_at     | DATETIME | on update                                        |

**Relationships:** `User 1—* HostedZone 1—* DNSRecord`. Deleting a user cascades to zones; deleting a zone cascades to its records.

---

## API Overview

Base URL: `http://localhost:8000/api` · Full interactive docs at `/api/docs`.

### Auth
| Method | Path             | Description                              |
| ------ | ---------------- | ---------------------------------------- |
| POST   | `/auth/login`    | Log in; sets httpOnly session cookie     |
| POST   | `/auth/register` | Create account and auto-sign-in          |
| POST   | `/auth/logout`   | Clear session cookie                     |
| GET    | `/auth/me`       | Current authenticated user               |

### Hosted Zones
| Method | Path           | Description                                          |
| ------ | -------------- | ---------------------------------------------------- |
| GET    | `/zones`       | List (query: `search`, `type`, `page`, `limit`)      |
| POST   | `/zones`       | Create (auto-seeds default NS + SOA records)         |
| GET    | `/zones/{id}`  | Get one                                              |
| PUT    | `/zones/{id}`  | Update comment / type                                |
| DELETE | `/zones/{id}`  | Delete (blocked if non-default records remain)       |

### DNS Records
| Method | Path                              | Description                                       |
| ------ | --------------------------------- | ------------------------------------------------- |
| GET    | `/zones/{id}/records`             | List (query: `search`, `type`, `page`, `limit`)   |
| POST   | `/zones/{id}/records`             | Create                                            |
| GET    | `/zones/{id}/records/{rid}`       | Get one                                           |
| PUT    | `/zones/{id}/records/{rid}`       | Update                                            |
| DELETE | `/zones/{id}/records/{rid}`       | Delete one (protected NS/SOA blocked)             |
| DELETE | `/zones/{id}/records?ids=1,2,3`   | Bulk delete                                       |
| POST   | `/zones/{id}/records/import`      | Import records from a pasted BIND zone file       |
| GET    | `/zones/{id}/export?format=json\|bind` | Export all of a zone's records as JSON or a BIND zone file |

Both list endpoints resolve search, filtering, sorting and pagination **server-side**:
`GET /zones` and `GET /zones/{id}/records` accept `sort_by` + `sort_order` (`asc`/`desc`, an
invalid value is a 422), and the records endpoint additionally accepts `routing_policy` and
`alias` filters. Sorting a zone therefore orders every record in it, not just the rows on the
current page. `record_count` sorts via a correlated `COUNT` subquery, since it is a computed
property rather than a column.

### Health
| Method | Path          | Description           |
| ------ | ------------- | --------------------- |
| GET    | `/health`     | Service health check  |

All zone/record endpoints require authentication and are scoped to the signed-in account.

---

## Notes & Known Gaps

Deliberate, and surfaced in the UI rather than hidden:

- Authentication is intentionally **mocked**; IAM, Organizations and Billing are not modeled.
- Hosted zone **tags** and **VPC associations** are UI-only — the forms validate them against
  the real AWS limits, but there is no table behind them yet, so they are not persisted.
- **Non-Simple routing policies** are listed and disabled (see above). Supporting them means
  storing `SetIdentifier`, `Weight`, failover role, `Region`, geolocation and CIDR collections,
  plus the conditional sub-forms the console reveals for each.
- **Alias records** are represented as a record with a `NULL` TTL and the target in `value`;
  a dedicated `alias` / `alias_target` / `evaluate_target_health` model would be better.
  Editing an existing record *into* an alias is not yet possible, because `RecordUpdate` cannot
  distinguish "TTL omitted" from "TTL cleared".
- **Deployment:** SQLite lives in a file next to the API, so a host with an ephemeral
  filesystem resets the data on every redeploy. Mount a persistent volume and point
  `DATABASE_URL` at it (e.g. `sqlite:////data/route53.db` — four slashes for an absolute path).
- There is **no Alembic**; tables are created on startup and a small in-code migration in
  `main.py` adds columns that arrived later. Fine at this size, but not how a real service
  should evolve a schema.
