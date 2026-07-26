# Route 53 Clone

A functional clone of the **AWS Route 53** console with persistent storage and a real backend API. The focus is on faithfully recreating the Route 53 **user experience and core workflows** (hosted zones and DNS records) rather than implementing actual DNS resolution.

> Records are stored and managed exactly like Route 53 manages them, but no DNS queries are ever served — this is a UI/UX + CRUD clone, not a name server.

---

## Tech Stack

| Layer     | Technology                          |
| --------- | ----------------------------------- |
| Frontend  | Next.js 15 (App Router) + TypeScript + Tailwind CSS |
| Backend   | FastAPI (Python)                    |
| Database  | SQLite (via SQLAlchemy ORM)         |
| Auth      | JWT in an httpOnly cookie (mocked AWS sign-in) |

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
- Console-style **navigation** (top bar + breadcrumbs)
- **Tables** with sortable headers, AWS-style **resizable columns** (drag the divider on a header's right edge), checkboxes and row selection
- **Forms** for creating zones and records
- **Search**, **filters** (type / routing policy / alias), and **pagination**
- **Modals** for destructive confirmations, **toast notifications**, and a split-panel detail view
- All data persists in SQLite

### Mocked sections ("Coming Soon")
Dashboard · Traffic Policies · Health Checks · Resolver · Profiles

### Bonus features
| Bonus                       | Status |
| --------------------------- | ------ |
| Import DNS records from BIND zone files | ✅ Implemented (paste a zone file; SOA/apex-NS are skipped, duplicates merged) |
| Dark mode                   | ✅ Implemented (persisted in `localStorage`) |
| Bulk operations             | ✅ Implemented (multi-select delete for records and zones) |
| Export as JSON / BIND       | ⬜ Not yet implemented |
| Keyboard shortcuts          | ⬜ Not yet implemented (only Escape-to-close menus) |

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

### Health
| Method | Path          | Description           |
| ------ | ------------- | --------------------- |
| GET    | `/health`     | Service health check  |

All zone/record endpoints require authentication and are scoped to the signed-in account.

---

## Notes & Known Gaps

- **Demo link** — a hosted deployment URL still needs to be added here (see assignment deliverables).
- **Export** (JSON / BIND) and **keyboard shortcuts** are unimplemented optional bonuses.
- Authentication is intentionally **mocked** for the assignment; IAM, Organizations, and Billing are not modeled.
