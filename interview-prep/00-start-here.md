# 00 — Start Here

Everything you need to explain this project — the Route 53 clone — under interview
pressure, written from the actual code rather than from memory.

**If you have five minutes**, read §1 and §2 on this page and nothing else.
**If you have an evening**, follow the study plan in §5.

---

## 1 — The 60-second pitch

Say this almost verbatim. It's the answer to "tell me about your project," and getting
the first thirty seconds right buys you the next ten minutes.

> It's a functional clone of the AWS Route 53 console. Route 53 is Amazon's DNS
> service — DNS being the system that translates a domain name like `example.com` into
> an IP address. The console is where you manage those translations.
>
> There are two core objects. A **hosted zone** is a container for one domain. A **DNS
> record** is a single entry inside it — this name, of this type, points at this value.
> The app does full CRUD on both, with authentication, and with search, sorting,
> filtering and pagination all resolved server-side.
>
> Next.js 15 and React 19 on the front, FastAPI on the back, SQLite through SQLAlchemy
> for storage. Nineteen endpoints, 226 backend tests, deployed on Vercel and Render.
>
> One scoping note: it doesn't resolve real DNS queries. It's the control plane — the
> part you use to *manage* records — not a name server.

**Why it lands:** it defines the domain before using its jargon, names the two nouns
everything else hangs off, gives concrete numbers, and closes the biggest hole in the
project before an interviewer can open it.

---

## 2 — The 3-minute version

When they say "go deeper," add these four beats in order.

**Architecture.** Three layers. The browser runs Next.js — pages, forms, tables, five
React contexts for shared state. It talks to a FastAPI backend over JSON, authenticated
with a JWT in an httpOnly cookie. FastAPI talks to SQLite through the SQLAlchemy ORM.
The two things with no direct Express equivalent are FastAPI's dependency injection —
`Depends(get_db)` and `Depends(get_current_user)` resolve before the handler body runs —
and Pydantic, which validates the request from type annotations before your code sees it.

**One design decision worth defending.** Validation lives in two layers on purpose.
Anything decidable from the request payload alone — is this a valid IPv4, is the TTL in
range — is a Pydantic rule. Anything needing another row from the database — is there
already a CNAME at this name, is this one of the apex NS/SOA records Route 53 manages —
lives in the route layer. A schema can't run a query, so the split is forced by what each
layer can see, not by style.

**One bug worth telling.** Route 53 alias records have no TTL, so I encoded "TTL is NULL"
to mean "this is an alias." It never worked, because the column was declared
`Column(Integer, default=300)` — and in SQLAlchemy `default=` doesn't mean "when the field
is missing," it means "when the Python attribute is `None` at flush time." `None` was
exactly the value carrying my meaning, so the ORM overwrote it on every insert. The fix
wasn't deleting the default, it was moving it to Pydantic — the only layer that can still
distinguish "client omitted TTL" from "client explicitly sent null."

**One honest limitation.** SQLite doesn't enforce foreign keys unless you turn the pragma
on, and nothing in this app turns it on — so the `ON DELETE CASCADE` I declared is
decorative. Deletion works, but through SQLAlchemy's Python-level cascade, not the
database. I know it, I know the fix, and I'd do it before adding a second developer.

---

## 3 — Numbers to have ready

Interviewers use specifics to test whether you actually built the thing.

| | |
| --- | --- |
| API endpoints | **19** (4 auth · 6 zones · 7 records · 2 root/health) |
| Backend tests | **226**, all passing |
| Database tables | **3** — `users`, `hosted_zones`, `dns_records` |
| React contexts | **5** — Auth, Theme, Notification, Drawer, Shortcuts |
| Tracked files | **111** (20 backend, 88 frontend incl. 55 reference screenshots) |
| Record types validated | 9 required + 8 more |
| Frontend tests | **0** — say it before they find it |

---

## 4 — The reading list

**How these files are built — read this once and the folder stops being intimidating.**

Every file opens with a **TL;DR box: the 5 things you must be able to say.** Read only
those eleven boxes and you can already hold a conversation about this project. That's
about 12 minutes total.

Every file is then split by a **🔎 Reference fold**:

```
   ┌─ TL;DR box .............. 5 bullets. Read always.
   │
   │  the teaching half ...... concepts, in reading order. Read this.
   │
   ├─ 🔎 Reference fold
   │
   └─ the lookup half ........ tables, captures, inventories. NEVER read linearly.
                               Ctrl-F it when you need one specific fact.
```

Roughly **40% of the folder sits below a fold.** It's there so an answer exists when you
need it — not so you can read it. If you find yourself reading below a fold, stop.

| # | File | Read | Look up | What it gives you |
| --- | --- | --- | --- | --- |
| 01 | [01-overview.md](01-overview.md) | 15 min | repo tree | What DNS is, what the app does, the request-flow diagram |
| 02 | [02-database.md](02-database.md) | 25 min | columns, DDL, rows | What the *database* enforces vs what only Python does — **densest file in the set** |
| 03 | [03-backend-overview.md](03-backend-overview.md) | 20 min | file list, CORS, deps | FastAPI itself, taught against Express |
| 04 | [04-backend-apis.md](04-backend-apis.md) | 8 min | all 19 endpoints | Conventions first; per-endpoint detail is pure reference |
| 05 | [05-frontend-overview.md](05-frontend-overview.md) | 18 min | routes, components, packages | App Router, the shell, the five contexts, theming |
| 06 | [06-frontend-crud.md](06-frontend-crud.md) | 22 min | hook inventory, form patterns | The four CRUD flows; why each hook was chosen |
| 07 | [07-bugs-and-debugging.md](07-bugs-and-debugging.md) | 20 min | — all narrative | Seven real bugs — **your strongest material** |
| 08 | [08-interview-qa.md](08-interview-qa.md) | 35 min aloud | — all drills | 51 questions with spoken-word answers |
| 09 | [09-auth-and-security.md](09-auth-and-security.md) | 20 min | hardening checklist | Login end to end, JWT, bcrypt, cookies, tenancy |
| 10 | [10-deployment-and-testing.md](10-deployment-and-testing.md) | 14 min | — short enough | Vercel + Render, cross-domain cookies, the test suite |
| 11 | [11-most-likely-questions.md](11-most-likely-questions.md) | 30 min | — all drills | **The seven topics someone who sat this interview said to prepare** — incl. showing your DB on screen and tracing a button end to end |

**Total above the fold: about 3 hours**, spread over the five evenings below. The other
2,300 lines are lookup material you should never read front to back.

### If you only read three

1. **[11-most-likely-questions.md](11-most-likely-questions.md)** — the seven areas someone
   who actually sat this interview named. It also has the one piece of homework in this
   folder: installing a viewer so you can **show** your database on screen.
2. **[07-bugs-and-debugging.md](07-bugs-and-debugging.md)** — anyone can list features;
   almost nobody can walk through a bug they found and proved. This is where the
   conversation gets interesting.
3. **[08-interview-qa.md](08-interview-qa.md)** — rehearsal. Say the answers out loud.

Then [02-database.md](02-database.md) if you have time — the most fact-dense file, and where
the sharpest follow-up questions land.

---

## 5 — A study plan

**Evening 0 — the 12-minute skim.**
Open all eleven files and read **only the TL;DR box** at the top of each. Nothing else.
You'll be surprised how much of a conversation you can already hold.

**Evening 1 — the shape (≈45 min).**
Read 01 and 02 **above the fold only**. Then, without looking, draw the three-layer diagram
and the three tables with their relationships. If you can't, reread 02.

**Evening 2 — the backend (≈45 min).**
Read 03 above the fold, then 09 above the fold. Skip 04's reference half entirely — instead
open `https://route53-clone-api-zgy9.onrender.com/api/docs` and click through a few
endpoints. Watching real responses beats reading captured ones.

**Evening 3 — the frontend (≈35 min).**
Read 05 and 06, above the fold. Open `frontend/src/app/hosted-zones/page.tsx` alongside 06
and follow the list-load flow in the actual file.

**Evening 4 — the stories (≈60 min).**
Read 07. Pick **two** bugs and tell each one out loud, unaided, in 90 seconds. The alias/TTL
bug and the hydration mismatch are the two to pick.

**Evening 5 — rehearsal (≈60 min).**
Work through 08 by speaking every answer. Anything that comes out mumbled is something
you don't understand yet — go back to the linked file for it.

**Morning of — 10 minutes.**
Reread §1 and §2 of this page, and the final checklist at the bottom of 08.

---

## 6 — How to answer well

**Structure every answer the same way.** One or two sentences of direct answer, then the
detail that proves you lived it. Interviewers will stop you when they've heard enough —
they can't stop you if you never reached the point.

**Say "I don't know."** Then say how you'd find out. It scores better than a confident
guess every single time, and a wrong guess costs you credibility on everything you said
before it.

**Volunteer your weaknesses.** "The `record_count` property is an N+1 and here's the fix"
makes you look like you know your own code. Having it found for you makes you look like
you don't. Four you should name unprompted:

- `record_count` is a Python property, so listing zones is an N+1
- `(zone_id, name, type)` uniqueness is checked in Python with no database constraint
- the httpOnly session cookie is undermined by a second, JS-readable copy of the same
  token that the frontend writes for its Bearer header
  ([09](09-auth-and-security.md#two-cookies))
- there are no frontend tests

**Never claim what you can't defend one level deeper.** Don't say "it's fully async" when
the handlers are sync `def`. Don't say "foreign keys cascade" when the pragma is off.
Every claim in these files is checked against the code precisely so you can go one
question deeper on any of them.

**Have the scope boundary ready.** "It doesn't resolve real DNS" should come from you, in
the first minute, framed as a decision. Said early it's scoping; extracted from you at
minute twenty it's a gap.

---

## 7 — Live links

| | |
| --- | --- |
| Console | https://route-53.vercel.app |
| API | https://route53-clone-api-zgy9.onrender.com |
| Interactive API docs | https://route53-clone-api-zgy9.onrender.com/api/docs |
| Demo login | `demo@route53.aws` / `Demo1234!` |

> The API is on Render's free plan, so the **first request after an idle period takes
> ~40 seconds** while the container wakes. If you're demoing live, load the site a minute
> before you share your screen.

Run it locally:

```bash
# backend  → http://localhost:8000   (docs at /api/docs)
cd backend
python -m venv venv && ./venv/Scripts/activate     # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload

# frontend → http://localhost:3000
cd frontend
npm install
npm run dev

# tests
cd backend && python -m pytest -q                   # 226 tests
```
