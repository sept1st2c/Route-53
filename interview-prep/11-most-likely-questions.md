# 11 — The Seven Topics They'll Actually Ask

> ### TL;DR — what this file is
>
> 1. **Someone who's been through this interview named seven areas.** This file drills exactly those, in their order, in plain language.
> 2. **The one with homework is §3** — they will ask you to *show* the database on screen. Install the viewer today, not on the day.
> 3. **§6 is the highest-value section** — "click this button and explain everything that happens." It's the classic whiteboard question and there's a script for four buttons.
> 4. **§4 is comparison questions** — `useState` vs `useRef`, `useMemo` vs `useCallback`. They want the difference, not the definition.
> 5. **Everything here is answerable from this repo.** No claim in this file is something you can't point at in the code.
>
> **Read all of it (~30 min).** This is a drill sheet, not reference — say the answers out loud.

**The seven topics:**

| # | Topic | Section |
| --- | --- | --- |
| 1 | API endpoints — what each does, why, where | [§1](#1--api-endpoints-what-why-where) |
| 2 | Database — why SQLite, how to scale, how you deployed | [§2](#2--the-database-why-sqlite-how-to-scale-how-you-deployed) |
| 3 | Tables and schema — **and showing the DB on screen** | [§3](#3--tables-schema-and-showing-your-database-live) |
| 4 | React hooks and the "difference between X and Y" questions | [§4](#4--react-hooks-and-the-difference-between-questions) |
| 5 | JWT and cookies | [§5](#5--jwt-and-cookies) |
| 6 | Request flow — "explain this button end to end" | [§6](#6--this-button-explain-everything-that-happens) |
| 7 | More database questions | [§7](#7--more-database-questions) |
| + | Six more areas they're likely to reach for | [§8](#8--six-more-they-are-likely-to-ask) |

---

<a id="1--api-endpoints-what-why-where"></a>

## 1 — API endpoints: what, why, where

### The one-breath answer

> "Nineteen endpoints, all under `/api`. Four for auth, six for hosted zones, seven for
> records, plus a health check and a root. They're grouped into three router files that
> mirror the three resources."

### Where they live

Think of a **router** as one file that owns one group of URLs. In Express you'd write
`app.use('/api/zones', zonesRouter)`. Same idea:

```
backend/app/routes/auth.py      →  /api/auth/*        4 endpoints
backend/app/routes/zones.py     →  /api/zones/*       6 endpoints
backend/app/routes/records.py   →  /api/zones/{id}/records/*   7 endpoints
backend/app/main.py             →  /api/health and /            2 endpoints
```

and they get wired together in [main.py:61-63](../backend/app/main.py#L61-L63):

```python
app.include_router(auth.router, prefix="/api")
app.include_router(zones.router, prefix="/api")
app.include_router(records.router, prefix="/api")
```

### All 19, and *why* each one exists

**Auth (4)** — everything about who you are.

| Endpoint | What it does | Why it exists |
| --- | --- | --- |
| `POST /api/auth/login` | Check email + password, hand back a token | The front door |
| `POST /api/auth/register` | Create an account **and** sign it in immediately | So sign-up doesn't need a second round trip |
| `POST /api/auth/logout` | Clear the cookie | Ends the browser session |
| `GET /api/auth/me` | "Who am I?" | **This is how a page refresh keeps you logged in** — the app has no memory, so on load it asks the server |

**Hosted zones (6)** — the folders.

| Endpoint | What it does | Why it exists |
| --- | --- | --- |
| `GET /api/zones` | List *your* zones, with search / filter / sort / page | The main table |
| `POST /api/zones` | Create a zone | Also auto-creates the apex NS + SOA records, like real Route 53 |
| `GET /api/zones/{id}` | One zone's details | The detail header on the records page |
| `PUT /api/zones/{id}` | Edit name/type/comment | The edit form |
| `GET /api/zones/{id}/export` | Download the zone as JSON or BIND | Bonus feature — real DNS interop format |
| `DELETE /api/zones/{id}` | Delete a zone | **Refuses with 409 if real records remain** — matches AWS, prevents accidental data loss |

**Records (7)** — the entries.

| Endpoint | What it does | Why it exists |
| --- | --- | --- |
| `GET /api/zones/{id}/records` | List records, with search/filter/sort/page | The records table |
| `POST /api/zones/{id}/records` | Create one record | The create form |
| `GET /api/zones/{id}/records/{rid}` | One record | Detail lookups |
| `PUT /api/zones/{id}/records/{rid}` | Edit a record | The edit panel |
| `DELETE /api/zones/{id}/records/{rid}` | Delete one | Single-row delete |
| `DELETE /api/zones/{id}/records?ids=1,2,3` | **Bulk** delete | The table lets you tick many rows; N requests would be slow and half-failing |
| `POST /api/zones/{id}/records/import` | Import a BIND zone file | Bonus feature |

**Housekeeping (2)** — `GET /api/health` returns `{"status":"ok"}` (Render polls it to decide
whether a deploy worked), and `GET /` is a friendly root.

### Two patterns worth naming

**Records are nested under zones.** The URL is `/api/zones/5/records`, not `/api/records`.
Why: a record cannot exist without a zone, and the URL then carries the ownership check for
free — we look up zone 5 *scoped to you*, and if it isn't yours we 404 before ever touching
records.

**Bulk delete uses a query string, not a body.** `DELETE /records?ids=1,2,3`. HTTP `DELETE`
with a request body is legal but poorly supported by proxies and caches, so the IDs go in
the URL.

### If they ask…

**"How do I see your API?"** — send them to
`https://route53-clone-api-zgy9.onrender.com/api/docs`. FastAPI generates that page from the
code, so it can never go stale. **Have this tab open before the interview.** It's the single
most impressive thing you can show in ten seconds.

**"Is it RESTful?"** — Yes, mostly: nouns for URLs, verbs as HTTP methods, correct status
codes (201 create, 204 delete, 404 missing, 409 conflict, 422 validation). One honest
deviation: `/import` and `/export` are verbs, because they're actions, not resources.

**"How do you version it?"** — I don't, and for a single-client demo that's the right call.
I'd add `/api/v1/` the moment an external consumer existed — full detail in
[04-backend-apis.md](04-backend-apis.md).

---

<a id="2--the-database-why-sqlite-how-to-scale-how-you-deployed"></a>

## 2 — The database: why SQLite, how to scale, how you deployed

### "Why SQLite?"

> "It was specified in the assignment, and for this app it's genuinely a good fit. SQLite
> isn't a server — it's **one file on disk**, and the database engine runs inside my Python
> process. So there's nothing to install, nothing to configure, and anyone who clones the
> repo has a working database instantly. It's still real SQL with real transactions."

The comparison that makes it click:

| | Postgres / MySQL | SQLite |
| --- | --- | --- |
| What is it? | A **server** you connect to over a port | A **file** your app opens directly |
| Setup | Install, run, create user, create DB | Nothing. The file appears |
| Concurrent writers | Many | **One at a time** |
| Good for | Real production | Demos, local dev, mobile apps, tests |

> Your MERN comparison: MongoDB is a server you start. SQLite is more like reading a JSON
> file — except it has tables, indexes, joins and transactions.

### "How would you scale it?"

Answer in **order of what breaks first.** That ordering is what makes it a senior answer.

**1. The write lock — this is the hard wall.** SQLite lets many readers in at once but only
**one writer**. Two people saving a record at the same moment: one waits, and under load you
get `database is locked`. You cannot tune your way out of it.
→ **Move to Postgres.** Because everything goes through the SQLAlchemy ORM, that's a
connection-string change plus a real migration — not a rewrite.

**2. You can't run two servers.** Two containers can't safely share one file. So no
horizontal scaling — and no zero-downtime deploys.
→ Postgres again. It unblocks this too.

**3. An N+1 query on the zones list.** `record_count` is a Python property doing
`len(self.records)` ([models.py:61-63](../backend/app/models.py#L61-L63)), so listing 20
zones fires 1 query for zones + 20 more for their records.

> **Jargon: N+1.** You run 1 query to get a list, then 1 more per item. 20 items = 21
> queries where 1 or 2 would do. Classic ORM trap — it's invisible in code and obvious in
> the query log.

→ Fix with eager loading (`selectinload`) or a `column_property` COUNT subquery.

**4. No caching.** Every list hits the database. → Redis in front of hot reads.

**5. No indexes where they're needed.** `dns_records.zone_id` is filtered by *every* record
query and has **no index**, so SQLite scans the table. Meanwhile all three `id` columns have
a redundant index (the primary key already is one).
→ Add `CREATE INDEX ON dns_records(zone_id)`; drop the redundant ones.

**Say the fix order out loud: Postgres → the N+1 → indexes → multiple instances → Redis.**
Postgres is first because it unblocks everything else.

### "How did you deploy it?"

Tell it as a story, three beats:

> "**Frontend on Vercel** — they build Next.js, so it's push-to-deploy with one environment
> variable pointing at the API.
>
> **Backend on Render**, from a Blueprint file in the repo called `render.yaml`. New →
> Blueprint → pick the repo → Apply, and it reads the build command, start command, health
> check and environment variables from that file. Nothing typed into a form. Render generates
> the JWT signing key itself, so the secret never exists in the repo.
>
> **The interesting problem was storage.** Render's free plan has an *ephemeral* filesystem —
> the container is rebuilt on every deploy and every wake-from-idle, and my database is a
> file on that disk. So the database is destroyed regularly. I handled it by seeding the demo
> account on startup, guarded so it can't duplicate and wrapped so a seeding failure can
> never stop the API booting. That's a demo workaround, not a solution — the real fix is a
> paid plan with a mounted disk, or Postgres."

Then the honest caveat, volunteered: *"First request after idle takes about 40 seconds while
the container wakes. It's in my README."*

**The two-domain consequence** — worth having ready because it's a favourite follow-up:
because the frontend is on `vercel.app` and the API on `onrender.com`, they're different
origins. That forces three things to line up: `allow_credentials` on the server,
`withCredentials` on the client, and `SameSite=None; Secure` on the cookie. Miss any one and
login silently fails. Full detail in
[10-deployment-and-testing.md](10-deployment-and-testing.md).

---

<a id="3--tables-schema-and-showing-your-database-live"></a>

## 3 — Tables, schema, and showing your database live

> ### ⚠️ This is the section with homework. Do it today.
> If they say "show me your database" and you spend three minutes googling a viewer, that's
> the part of the interview they'll remember. Pick one of the three options below and
> **actually open your database once before the day.**

### Option A — a VS Code extension (easiest, you're already in VS Code)

1. Open the Extensions panel (`Ctrl+Shift+X`)
2. Search **"SQLite Viewer"**
3. Install it
4. In the file explorer, click `backend/route53.db`

It opens as a browsable table. Nothing to configure, and you never leave your editor — which
also means one less window to fumble while screen-sharing.

### Option B — DB Browser for SQLite (the standard GUI)

Download from **https://sqlitebrowser.org** → *Open Database* → pick
`backend/route53.db`. Two tabs matter:

- **Database Structure** — the tables, columns, and indexes. This is the "show me your
  schema" tab.
- **Browse Data** — the actual rows, with a table dropdown.

Slightly more impressive on a shared screen than the VS Code panel, because it also renders
the `CREATE TABLE` SQL.

### Option C — the script in this repo (zero install, works right now)

I added [`backend/tools/show_db.py`](../backend/tools/show_db.py). It opens the file
**read-only**, so it can't corrupt or lock anything:

```bash
cd backend
python tools/show_db.py                 # schema + indexes + row counts + sample rows
python tools/show_db.py --full          # every row
python tools/show_db.py --sql "SELECT type, COUNT(*) FROM dns_records GROUP BY type"
```

Password hashes print as `<bcrypt hash>` rather than the real value — safe to put on screen.

Real output, trimmed:

```
==============================================================================
  backend\route53.db
  49,152 bytes on disk   |   SQLite 3.45.1   |   foreign_keys = 0
==============================================================================

### TABLE dns_records  -  12 rows

  columns
    column          type      null?     default            key
    --------------  --------  --------  -----------------  ---
    id              INTEGER   NOT NULL  NULL               PK
    zone_id         INTEGER   NOT NULL  NULL
    name            VARCHAR   NOT NULL  NULL
    type            VARCHAR   NOT NULL  NULL
    ttl             INTEGER   nullable  NULL
    value           TEXT      NOT NULL  NULL
```

**Bonus: this script proves two of your best talking points on screen.** It prints
`foreign_keys = 0` and shows that `hosted_zones` has no foreign key on `owner_id` while
`dns_records.zone_id` does. Being able to *demonstrate* a limitation you already described
lands much harder than describing it.

> **If they ask about the deployed database instead:** you can't open that file — it's inside
> Render's container and it's rebuilt on every wake. Say exactly that, and show the local one.
> It's the same schema; `create_all()` builds both from `models.py`.

### The schema, in words you can say

Three tables, two one-to-many relationships:

```
   users                    hosted_zones                  dns_records
   ─────                    ────────────                  ───────────
   id          ──owns──▶    id                ──has──▶    id
   email                    owner_id  ────────┘           zone_id  ──┘
   hashed_password          zone_id  (the "Z..." ID)      name
   full_name                name     (example.com.)       type
   created_at               type     (Public/Private)     ttl
                            comment                       value
                            created_at / updated_at       routing_policy
                                                          comment
```

> "One user has many hosted zones. One hosted zone has many DNS records. That's it — two
> one-to-many hops, and the `owner_id` on the zone is what makes the app multi-tenant."

### Two schema details they will poke at

**`zone_id` appears twice and means different things.** On `hosted_zones` there's `id` (the
integer primary key, used in URLs) *and* `zone_id` (the Route 53-style `Z1M3NDWMLIK19E`
display ID). On `dns_records`, `zone_id` is the **foreign key** — an integer pointing at
`hosted_zones.id`. Confusing naming; I'd rename the display one to `route53_zone_id`.

**One row holds a whole record *set*.** An NS record has four name servers. Instead of four
rows, it's one row whose `value` is the four values joined by `\n`:

```
value = "ns-1.awsdns-1.com.\nns-2.awsdns-2.net.\nns-3.awsdns-3.co.uk.\nns-4.awsdns-4.org."
```

Why: Route 53's own model is a *record set* keyed by name + type, and the console edits all
values together in one textarea. The API splits it back into an array on the way out. The
cost is that you can't query or index an individual value — full trade-off in
[02-database.md](02-database.md).

---

<a id="4--react-hooks-and-the-difference-between-questions"></a>

## 4 — React hooks and the "difference between" questions

These come as comparisons. They don't want a definition, they want **when you'd pick each** —
and ideally an example from your own code.

### `useState` vs `useRef`

| | `useState` | `useRef` |
| --- | --- | --- |
| Changing it re-renders? | **Yes** | **No** |
| Read the value | `count` | `ref.current` |
| Use it when | the screen must change | you need to remember something the screen doesn't show |

**Your real example** — [DrawerContext.tsx:46](../frontend/src/context/DrawerContext.tsx#L46):

```tsx
const dismissed = useRef(false);
```

> "This remembers whether the user manually closed the details panel, so it doesn't pop back
> open on the next selection. It's a ref because nothing on screen depends on it — making it
> state would re-render the whole tree every time it flipped, for no visual change."

### `useMemo` vs `useCallback`

Both cache. The difference is **what**.

- `useMemo` caches a **value** — "don't recompute this."
- `useCallback` caches a **function** — "don't recreate this function."

`useCallback(fn, deps)` is really just `useMemo(() => fn, deps)`.

**Why you'd bother with `useCallback` at all:** functions are objects, so a new one every
render is a *different* object. If an effect depends on it, the effect re-runs every render.

**Your real example** — the debounced search at
[hosted-zones/page.tsx:141-166](../frontend/src/app/hosted-zones/page.tsx#L141-L166):

```tsx
const load = useCallback(async () => { /* fetch zones */ },
  [search, page, pageSize, sortingColumn, sortingDescending, notify]);

useEffect(() => {
  const t = setTimeout(load, search ? 300 : 0);
  return () => clearTimeout(t);
}, [load, search]);
```

> "Each keystroke changes `search`, which gives `load` a new identity, which re-runs the
> effect, whose cleanup cancels the previous timer. So only the last keystroke in a 300ms
> window actually fetches. Paging and sorting use 0ms because those should feel instant."

**The senior addition**, if they push: *"This only works because everything `load` closes
over is stable. `notify` comes from context as a `useCallback`, so it keeps the same identity.
If it didn't, `load` would be new every render, the effect would re-run every render, and the
debounce would collapse into one request per render."*

**Your `useMemo` example** — [import/page.tsx:210-213](../frontend/src/app/hosted-zones/[id]/import/page.tsx#L210-L213) memoises parsing a BIND zone file, which would otherwise re-parse on every keystroke in the textarea.

### `useEffect` — the three shapes of the dependency array

```tsx
useEffect(() => {...})            // no array   → after EVERY render (almost always a bug)
useEffect(() => {...}, [])        // empty      → once, on mount
useEffect(() => {...}, [a, b])    // values     → whenever a or b changes
```

And the **cleanup function** — the thing you return:

```tsx
useEffect(() => {
  let active = true;
  (async () => {
    if (!hasToken()) { setLoading(false); return; }
    try {
      const u = await authService.me();
      if (active) setUser(u);       // ← don't set state if we've since unmounted
    } catch {
      clearToken();
    } finally {
      if (active) setLoading(false);
    }
  })();
  return () => {
    active = false;
  };
}, []);
```
— [AuthContext.tsx:23-42](../frontend/src/context/AuthContext.tsx#L23-L42), verbatim

> "The `active` flag stops two things: setting state after the component unmounted, and an
> older response overwriting a newer one. `AbortController` would be better because it would
> actually cancel the request rather than ignore the answer — I'd use that if I revisited it."

### Context vs Redux

| | React Context | Redux |
| --- | --- | --- |
| Extra library? | No, built in | Yes |
| Boilerplate | A provider + a hook | Store, actions, reducers |
| Re-render behaviour | **Every consumer** re-renders when the value changes | Selectors — only components using the changed slice |
| Right for | a few pieces of rarely-changing global state | large, frequently-updating state |

> "I used five small contexts — auth, theme, toasts, drawers, keyboard shortcuts. None of
> them update often. Redux would be more machinery for the same result. Where Context stops
> scaling is that re-render behaviour: a big frequently-changing store re-renders everything
> that reads it. Splitting into five contexts instead of one is me handling that — a theme
> change doesn't re-render toast consumers."

### Controlled vs uncontrolled inputs

- **Controlled** — React holds the value: `value={x} onChange={e => setX(e.target.value)}`
- **Uncontrolled** — the DOM holds it, you read it with a ref

Every form in this app is controlled, which is what makes per-field inline validation
possible: you're validating on every keystroke because you already have the value.

### Two more you should have a line for

**Why keys in lists?** So React can tell which item is which between renders. Using the array
index as a key breaks when the list reorders or you delete from the middle — React reuses the
wrong DOM node and state sticks to the wrong row.

**Server vs client components (Next.js App Router).** Server components render on the server
and ship no JavaScript, but can't use hooks or event handlers. Nearly everything here is
`"use client"` because it's all interactive. The honest cost: this app gets little benefit
from server rendering. The zone list *could* be a server component with only the interactive
table as a client child.

---

<a id="5--jwt-and-cookies"></a>

## 5 — JWT and cookies

### What a JWT actually is

Three chunks of base64 separated by dots:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9  .  eyJzdWIiOiJkZW1vQHJvdXRlNTMuYXdzIiwiZXhwIjoxNzg1Mzg2NjM0fQ  .  C2M8SognTpl...
        header                                          payload                                            signature
     "algorithm: HS256"                      "sub: demo@route53.aws, exp: <timestamp>"          proof it wasn't tampered with
```

**The single most important fact: the payload is *encoded*, not *encrypted*.** Anyone holding
the token can read it — paste one into jwt.io and see. The signature only proves nobody
*changed* it.

> So you never put anything secret in a JWT. Mine holds the user's email (`sub`) and an
> expiry (`exp`) — both harmless.

**Why "stateless"?** The server stores nothing. It doesn't keep a list of valid sessions — it
just verifies the signature with its secret key. Great for scaling (any server can verify
any token), and the downside is the next question.

### "How do you log someone out / revoke a token?"

Volunteer this weakness — it's the best question in the topic:

> "Honestly, I can't fully. Logout clears the cookie, which ends the browser session. But
> because the token is stateless, a copy of it stays valid until it expires — 24 hours. If I
> needed real revocation I'd add either short-lived access tokens plus refresh tokens, or a
> denylist of revoked token IDs in Redis — which does reintroduce state, and that's the
> trade-off you're accepting."

### Cookie vs localStorage — the classic

| Storage | XSS (attacker runs JS on your page) | CSRF (another site triggers a request) |
| --- | --- | --- |
| `localStorage` | ❌ **Any script can read it** | ✅ Immune — not sent automatically |
| httpOnly cookie | ✅ JavaScript can't read it | ❌ Sent automatically, so forgeable |

> "Neither is strictly safer — you're choosing which attack to defend. I'd rather defend
> CSRF, because XSS is total: if someone runs JavaScript on my origin they read
> `localStorage`, steal the token, and replay it from their own machine forever. CSRF is
> bounded — they can trigger actions but never read responses, and `SameSite` blocks most of
> it with one flag."

**Jargon, defined:**
- **httpOnly** — a flag saying "JavaScript may not read this cookie." Only the browser sends it.
- **Secure** — "only send over HTTPS."
- **SameSite** — controls whether the cookie rides along on requests from *other* sites.
  `Strict` never, `Lax` only on top-level navigation, `None` always (and `None` requires `Secure`).

### The cookie flags in your code

[auth.py:42-48](../backend/app/routes/auth.py#L42-L48):

```python
response.set_cookie(
    key="access_token",
    httponly=True,
    max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,      # 24 hours
    samesite="none" if IS_PRODUCTION else "lax",
    secure=IS_PRODUCTION,
)
```

> "In dev the frontend and API are both on localhost, so `Lax` works and `Secure` has to be
> off because localhost isn't HTTPS. In production they're on different domains — Vercel and
> Render — so the cookie is cross-site and `Lax` would block it entirely: you'd appear logged
> out on every request. `None` is the only value that works, and the spec requires `Secure`
> alongside it."

### 🔴 The thing to volunteer before they find it

> "There's a flaw I found auditing my own code. The backend sets an httpOnly `access_token`
> cookie — but the *frontend* separately writes the same JWT into an `r53_token` cookie using
> js-cookie, so it can attach an `Authorization: Bearer` header. js-cookie writes from
> JavaScript, so that copy **can't** be httpOnly. Which means the token is readable by script
> after all — the httpOnly flag is doing no real work in the browser.
>
> The fix is small: delete the frontend's copy and rely on `withCredentials`, which already
> sends the httpOnly cookie and which the backend already prefers."

Prove it live if you want: log in, open the console, type `document.cookie`. You'll see
`r53_token=...` and not `access_token`. That's the problem.

Saying this is a big win. "I used an httpOnly cookie" is textbook. "I used one, then found my
own implementation defeats it, and here's the two-line fix" is someone who audits their work.
Full write-up: [09-auth-and-security.md](09-auth-and-security.md#two-cookies).

### Why bcrypt and not SHA-256

> "SHA-256 is built to be **fast**, which is exactly wrong for passwords — fast means an
> attacker with your hash file tries billions per second. bcrypt is deliberately **slow**,
> with a tunable cost you raise as hardware improves, and it salts automatically so two users
> with the same password get different hashes. That defeats rainbow tables."

---

<a id="6--this-button-explain-everything-that-happens"></a>

## 6 — "This button — explain everything that happens"

> **This is the question your friend flagged hardest, and it's the one that separates people.**
> The trick is to narrate **layer by layer**, always saying which file you're in. Four buttons
> below; learn the first one properly and the rest are variations.

### The universal skeleton — memorise this shape

```
 1. Click            →  React onClick handler
 2. Validate         →  in the browser, before any network call
 3. Service layer    →  lib/services.ts turns arguments into an HTTP call
 4. axios            →  lib/api.ts adds base URL, cookie, auth header
 5. ───── network ─────
 6. FastAPI routing  →  matches URL + method to a handler
 7. Dependencies     →  get_db (open a session), get_current_user (decode JWT)
 8. Pydantic         →  validate the body, 422 if bad
 9. Route logic      →  the rules that need the database
10. SQLAlchemy       →  build SQL, execute, commit
11. Response model   →  serialise, dropping anything not declared
12. ───── network ─────
13. Handle result    →  toast, then refetch or redirect
```

---

### Button 1 — "Create records" on the create-record page

**Say it like this:**

> **1. The click.** The button calls `submit()` in
> [records/create/page.tsx:182](../frontend/src/app/hosted-zones/[id]/records/create/page.tsx#L182).
> The form supports several records at once, so state is an array of "blocks."
>
> **2. Validate in the browser first.** It marks every block as submitted so errors become
> visible, then bails out if any block has errors:
>
> ```tsx
> setBlocks((bs) => bs.map((b) => ({ ...b, submitted: true })));
> if (blocks.some((b) => Object.keys(validateBlock(b, zoneNoDot)).length > 0)) return;
> ```
>
> This is a UX optimisation, not security — it saves a round trip. The server validates
> again regardless, because anyone can bypass a browser.
>
> **3. Build the payload per block.** The name is assembled from the subdomain plus the zone,
> and there's one interesting line — alias records send `ttl: null`:
>
> ```tsx
> ttl: b.alias ? null : Number(b.ttl),
> ```
>
> In Route 53 an alias points at an AWS endpoint and inherits *its* TTL, so it has none of
> its own. `ttl IS NULL` is how this app marks an alias.
>
> **4. Service layer.** `recordService.create(zoneId, payload)` in
> [lib/services.ts](../frontend/src/lib/services.ts) — the component never sees a URL.
>
> **5. axios.** [lib/api.ts](../frontend/src/lib/api.ts) has the base URL, `withCredentials`
> so the cookie goes along, and a request interceptor that adds
> `Authorization: Bearer <token>`.
>
> **6–7. Server side.** FastAPI matches `POST /api/zones/{zone_id}/records` at
> [records.py:197](../backend/app/routes/records.py#L197). Before the function body runs, two
> dependencies resolve: `get_db` opens a database session, and `get_current_user` decodes the
> JWT and loads the user — 401 if anything's wrong. **Auth is enforced by the signature: the
> only way to get the user is to pass the check.**
>
> **8. Pydantic validates.** `RecordCreate` checks the type is known, the TTL is in range, and
> the value matches the type — an `A` record must be a valid IPv4. Fails → 422 with per-field
> errors, and my code never runs.
>
> **9. The rules that need the database.** `get_zone_or_404` fetches the zone filtered by
> `owner_id == current_user.id` — so someone else's zone is a 404, not a 403. Then
> `check_record_set_conflicts` ([records.py:65](../backend/app/routes/records.py#L65)) enforces
> what a schema can't, because each rule needs *other rows*: no CNAME at the zone apex, nothing
> else alongside a CNAME, and one record set per (name, type). Violations → 409.
>
> **10. Write it.** Build the `DNSRecord` object, `db.add()`, `db.commit()`, `db.refresh()`.
>
> **11. Respond.** `response_model=RecordOut` serialises and strips anything not declared.
> Status 201.
>
> **12–13. Back in the browser.** Success → a toast and `router.push(recordsHref)` to the
> records list. Failure → the error goes *inline in the form* via `setSubmitError`, because
> there's a form to attach it to.

**The two details that make this answer sound senior:**
- *Validation happens twice on purpose.* Browser-side for speed, server-side for safety.
- *`ttl: null` is a sentinel*, and it caused my nastiest bug — the column had
  `default=300`, and SQLAlchemy's `default=` fires whenever the attribute is `None` at flush
  time, so the ORM silently overwrote the very value that carried the meaning.

---

### Button 2 — "Delete record" (bulk, with the confirmation modal)

> **1.** Ticking checkboxes updates `selectedItems` state. The Delete button is disabled while
> that's empty.
>
> **2.** Clicking it doesn't delete — it calls `setDeleteOpen(true)`, which opens a
> confirmation modal. **Destructive actions always confirm.**
>
> **3.** Confirming calls `doDelete()` at
> [records/page.tsx:297](../frontend/src/app/hosted-zones/[id]/records/page.tsx#L297).
>
> **4.** One request for all rows:
> ```tsx
> await recordService.bulkRemove(zoneId, selectedItems.map((r) => r.id));
> ```
> → `DELETE /api/zones/5/records?ids=3,7,9`. One round trip instead of N, and no
> half-succeeded state.
>
> **5.** Server side: ownership check, then the protected-record rule — the apex NS and SOA
> that Route 53 manages **cannot** be deleted. Returns **204 No Content**: success, nothing to
> send back.
>
> **6.** And there's a subtle branch I'd point out:
> ```tsx
> if (records.length === selectedItems.length && page > 1) setPage((p) => p - 1);
> else refreshAll();
> ```
> If you just deleted every row on page 3, stepping back to page 2 changes `page`, which the
> loader already depends on — so it refetches by itself. Calling `refreshAll()` too would fire
> a second, wasted request.

---

### Button 3 — "Sign in"

> **1.** `POST /api/auth/login` with email and password.
> **2.** Server loads the user by email and verifies the password with bcrypt (~100ms — slow
> on purpose).
> **3.** On success it signs a JWT and delivers it **twice**: as an httpOnly cookie, and in
> the response body so non-browser clients like `curl` can use a Bearer header.
> **4.** The frontend stores it and sets `user` in `AuthContext`.
> **5.** `AppShell` sees a user and renders the app; on a page refresh there's no memory, so
> the app calls `GET /api/auth/me` to restore the session — which is why refresh keeps you
> logged in.
>
> **One detail worth volunteering:** the failure message is identical for "no such account"
> and "wrong password." Otherwise the endpoint becomes a **user-enumeration oracle** — submit
> a list of emails with a junk password and learn which ones are registered.

---

### Button 4 — "Delete zone" (the one that refuses)

> `DELETE /api/zones/{id}` → but the handler first checks what records remain
> ([zones.py:250](../backend/app/routes/zones.py#L250)). Anything other than the default apex
> NS and SOA and it returns **409 Conflict** with a real explanation:
>
> *"Before you can delete a hosted zone, you must delete all records in it other than the
> default NS and SOA records."*
>
> That's deliberate parity with AWS — it stops you destroying a domain's DNS with one click.
> If the zone *is* empty, `db.delete(zone)` also removes its records via SQLAlchemy's
> `delete-orphan` cascade.
>
> **The honest footnote:** that cascade happens in **Python, not the database.** SQLite has
> foreign keys switched off by default and nothing in the app turns them on, so my declared
> `ON DELETE CASCADE` is decorative. It works through the ORM and would not work if anyone
> wrote raw SQL. You can see `foreign_keys = 0` in the script from §3.

---

<a id="7--more-database-questions"></a>

## 7 — More database questions

### "What's an ORM? Why use one?"

> "It maps database rows to objects, so I write `db.query(HostedZone).filter(...)` instead of
> SQL strings. Three real benefits: parameterisation is automatic, so SQL injection isn't
> something I can do by accident; the database is swappable, so moving to Postgres is a
> connection-string change; and relationships are navigable — `zone.records` just works.
>
> The cost is you must know what SQL it's generating, or you write N+1 queries without
> noticing. Which I did."

> Your MERN comparison: SQLAlchemy is Mongoose. The only real difference is relational vs
> document.

### "How do you handle migrations?"

> **Jargon: a migration** is a versioned change to the database's shape — adding a column,
> renaming a table — that can be applied to an existing database without losing data.

> "Honestly, I don't do it properly. There's a hand-rolled `run_migrations()` in `main.py`
> that checks `PRAGMA table_info` and adds `owner_id` with `ALTER TABLE` if it's missing. That
> was enough to add ownership to a database that already had data.
>
> It has a real defect: SQLite's `ALTER TABLE ADD COLUMN` **cannot** add a foreign key, and
> `create_all()` only creates missing tables — it never repairs existing ones. So on my local
> database `owner_id` has no foreign key and no index, even though the model declares both. On
> a *fresh* database they'd be there. That gap between the model and the file is exactly the
> class of bug **Alembic** exists to prevent, and I'd add it before a second developer touched
> this."

### "Is there a uniqueness constraint on records?"

> "In application code, not in the database. Before inserting, the route queries for an
> existing `(zone_id, name, type)` and rejects with 409 if one exists.
>
> That's a **TOCTOU race** — time of check to time of use. Two concurrent requests can both
> see nothing and both insert.
>
> And I want to be precise about why it hasn't bitten, because the easy answer is wrong.
> People say 'SQLite serialises writers so it's fine' — but the lock only covers the *write*.
> The two SELECTs overlap freely. So the realistic failure is `database is locked` under
> contention, not silent de-duplication.
>
> The correct fix is a unique index on those three columns, keeping the Python check only to
> produce a friendly message instead of a raw integrity error."

### "SQL vs NoSQL — why relational here?"

> "The data is genuinely relational: a user owns zones, a zone owns records, and I query
> across those relationships constantly — 'all records in this zone', 'all zones for this
> user'. Foreign keys and joins are the right tool.
>
> Coming from MongoDB, the instinct is to embed records inside the zone document. That would
> actually work for reads, but it breaks down when you want to paginate and sort records
> server-side within one zone, which is exactly what the console does."

### "What's an index? What does it cost?"

> "A lookup structure so the database doesn't scan every row. Like a book index — without it
> you read every page.
>
> The cost is writes and disk: every insert or update has to maintain the index too. So you
> index what you filter and sort by, not everything.
>
> My repo gets this slightly wrong in both directions: all three `id` columns have a redundant
> index, because a primary key already is one — while `dns_records.zone_id`, which *every*
> record query filters on, has none."

### "Transactions — do you use them?"

> "Implicitly. SQLAlchemy's session is a unit of work: I mutate objects and then `db.commit()`.
> Everything before the commit is one transaction, and `get_db` closes the session in a
> `finally` block so it's always cleaned up even if the handler raises.
>
> One place I *should* be more careful is the BIND import, which creates many records in a
> loop. If record 10 fails, the first 9 are already committed. Wrapping the whole import in one
> transaction so it's all-or-nothing would be better — though partial success with an error
> list is also a defensible design for an import, and it's what I chose."

---

<a id="8--six-more-they-are-likely-to-ask"></a>

## 8 — Six more they're likely to ask

### a) "Why is validation in two places?"

Not duplication — a principle:

- **Anything decidable from the request alone** → Pydantic (`schemas.py`). Is this a valid
  IPv4? Is the TTL in range?
- **Anything needing another row** → the route layer. Is there already a CNAME at this name?
  Is this a protected apex record?

> "A schema can't run a query — it only sees the payload. So the split is forced by what each
> layer can observe, not by style. The nice consequence is my tests split the same way: schema
> tests are fast and need no database, route tests are slower and need one."

### b) "Why 404 and not 403 for someone else's zone?"

> "403 says 'this exists but isn't yours' — that leaks information. You could enumerate IDs
> and learn which are real. 404 says nothing.
>
> It falls out of how the query is written anyway: every lookup filters on both `id` and
> `owner_id`, so a foreign resource simply doesn't come back."

### c) "What is CORS and why did you need it?"

> "Browsers block a page on one origin from reading a response from another unless the server
> says it's allowed. My frontend is on Vercel and my API on Render — different origins — so
> the API lists the allowed origins explicitly.
>
> One detail that catches people: with `allow_credentials=True` you **cannot** use
> `allow_origins=["*"]`. The spec forbids it, because a wildcard plus credentials would let
> any site make authenticated requests as your user. So the origins have to be listed exactly."

### d) "How did you test it?"

> "226 pytest tests — 48 on validation, 26 on the startup seeding, 24 on route-level rules, 8
> on the zone-file parser. They run against a throwaway SQLite file in a temp directory,
> injected by overriding the `get_db` dependency, so the real database is never touched.
>
> A detail I like: the validation tests use **AWS's own published record examples** as
> fixtures. So they don't test 'does my code do what I wrote', they test 'does my code match
> the spec'.
>
> And the gap, before you find it: there are **no frontend tests**. The UI was verified by
> driving a real browser, which proves it worked once and catches nothing on the next change."

### e) "Add a feature right now — where would you change it?"

They may ask you to walk through adding a field. Name the files in order — this proves you
know your own codebase:

```
1. backend/app/models.py      add the column
2. a migration               ALTER TABLE (or Alembic, properly)
3. backend/app/schemas.py     add it to RecordCreate/RecordUpdate/RecordOut + validation
4. backend/app/routes/…       accept it in the handler, pass it to the model
5. frontend/src/types/        add it to the TypeScript type
6. frontend/src/lib/services  it rides along in the payload automatically
7. the form component         add the input + validation
8. the table                  add the column + the preferences entry
9. backend/tests/             a test for the new validation rule
```

> "Nine touch points for one field. That's the honest cost of a typed stack end to end — and
> it's also why the compiler catches it if I forget step 5."

### f) "What would you change if you started again?"

Have four, in priority order:

1. **Postgres and Alembic from day one** — it unblocks scaling, and no hand-rolled `ALTER TABLE`.
2. **Turn on `PRAGMA foreign_keys`** so the cascade is real, and add the missing `zone_id` index.
3. **Centralise the tenant filter.** `owner_id` is repeated at about seven sites. Correct today;
   one forgotten filter tomorrow silently leaks data across accounts. A dependency returning an
   already-scoped query makes the unscoped version unreachable.
4. **Frontend tests**, starting with form validation and the auth guard.

> "Notice none of that is features. The app does what was asked. The work goes into what makes
> it maintainable by someone who isn't me."

---

## The 60-second warm-up before you walk in

Have these three tabs open:

1. `https://route-53.vercel.app` — **loaded and signed in already.** The API cold-starts in
   ~40 seconds after idle; don't let that happen on screen.
2. `https://route53-clone-api-zgy9.onrender.com/api/docs` — the interactive API docs.
3. Your database open in the viewer from [§3](#3--tables-schema-and-showing-your-database-live).

And have these five sentences ready:

- *"A hosted zone is a folder for one domain; a DNS record is an entry inside it."*
- *"It doesn't resolve real DNS — it's the control plane."*
- *"Validation is split in two on purpose: payload rules in the schema, row-dependent rules in the route."*
- *"`ttl IS NULL` marks an alias record, and that sentinel caused my hardest bug."*
- *"My three known weaknesses are the `record_count` N+1, uniqueness enforced in Python instead of the database, and no frontend tests."*

That last one is the most important line in this file. **Name your weaknesses before they
find them.** It converts every follow-up from an interrogation into a conversation.
