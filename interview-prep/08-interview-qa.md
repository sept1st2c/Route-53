# 08 — Interview Q&A Bank

> **How to use this.** These answers are written to be *spoken*, not read. Say them out
> loud once each — the ones that feel awkward in your mouth are the ones you don't
> actually understand yet, and that's the signal to go back to the linked doc.
>
> **The format that works:** answer in one or two sentences, then add the detail that
> proves you lived it. Interviewers stop you when they've heard enough; they can't stop
> you if you never got to the point.
>
> **Three rules that matter more than any answer below:**
> 1. If you don't know, say "I don't know" and then say what you'd do to find out. It
>    scores better than a confident guess, every single time.
> 2. Never claim something you can't defend one follow-up deeper.
> 3. Volunteer a weakness before they find it. "The auth code is my thinnest test
>    coverage" makes you credible; being caught not knowing does the opposite.

---

## Contents

1. [The pitch](#1--the-pitch)
2. [Python & FastAPI](#2--python--fastapi)
3. [Database & SQLAlchemy](#3--database--sqlalchemy)
4. [React & Next.js](#4--react--nextjs)
5. [Auth & security](#5--auth--security)
6. [Testing](#6--testing)
7. [Debugging](#7--debugging)
8. [Scaling & trade-offs](#8--scaling--trade-offs)
9. [Behavioural](#9--behavioural)
10. [Questions to ask them](#10--questions-to-ask-them)

---

# 1 — The pitch

### Q1. Tell me about this project.

> It's a functional clone of the AWS Route 53 console. Route 53 is Amazon's DNS
> service — DNS being the system that turns a domain name like `example.com` into an IP
> address. The console is where you manage those mappings.
>
> The app has two core objects: **hosted zones**, which are containers for one domain,
> and **DNS records**, the individual entries inside them. Full CRUD on both, with
> authentication, server-side search, sorting and pagination, and a UI that closely
> matches the real console.
>
> Stack is Next.js 15 and React 19 on the front, FastAPI on the back, SQLite through
> SQLAlchemy for storage. Nineteen endpoints, 226 backend tests, deployed on Vercel and
> Render.
>
> One thing I'll flag up front: it doesn't resolve actual DNS queries. It's the control
> plane — the part you'd use to *manage* records — not a name server.

**Why this works:** defines the domain before the jargon, names the two nouns everything
else hangs off, gives numbers, and states the scope boundary before it can be used
against you.

### Q2. Why did you build it this way?

> The assignment specified SQLite and a clone of the console. Within that I chose FastAPI
> because Pydantic gives you request validation from type hints for free, plus generated
> interactive API docs — which mattered because I was building the frontend against my
> own API and could exercise every endpoint at `/api/docs` before writing a line of React.
>
> On the frontend I used the App Router and plain React Context. No Redux, no React
> Query — for an app with five pieces of shared state that's less machinery for the same
> outcome.

### Q3. What was the hardest part?

> Alias records. In Route 53 an alias points at an AWS endpoint instead of holding data,
> and it has no TTL of its own. I encoded that as `ttl IS NULL` — null TTL *means* alias.
>
> It didn't work, and the reason was one word: the column was declared
> `Column(Integer, default=300)`. In SQLAlchemy `default=` doesn't mean "if the field is
> missing" — it means "if the Python attribute is `None` at flush time." `None` was
> exactly the value carrying my meaning, so the ORM overwrote it on every insert.
>
> The fix wasn't just deleting the default. It was moving it to the layer that can still
> tell the two cases apart — Pydantic sees the raw request, so it knows the difference
> between "the client omitted TTL" and "the client explicitly sent null." By the time
> SQLAlchemy sees it, both look identical.

*Then, if they want more:* "And fixing that unmasked a second bug, because alias values
aren't rdata for their type — full story in the docs."

### Q4. What would you do differently?

> Four things, in order of how much they'd matter.
>
> Turn on `PRAGMA foreign_keys`. SQLite doesn't enforce foreign keys by default and
> nothing in the app turns it on, so my `ON DELETE CASCADE` is decorative — cleanup works
> only because SQLAlchemy's ORM-level cascade does it in Python.
>
> Use Alembic instead of the hand-rolled `ALTER TABLE` I wrote in `main.py`.
>
> Put a real unique constraint on `(zone_id, name, type)` rather than checking in Python
> first, which is a time-of-check-to-time-of-use race.
>
> And add frontend tests. All 226 are backend.

---

# 2 — Python & FastAPI

### Q5. You're a MERN developer. How did you find FastAPI?

> Closer to Express than I expected. Same mental model — a router, decorators instead of
> `app.get(...)`, handlers that return data. Two things are genuinely different.
>
> First, validation is declarative. You annotate the request body with a Pydantic model
> and FastAPI validates it before your function runs, returning a 422 with per-field
> errors automatically. In Express I'd wire Joi or Zod up myself in middleware.
>
> Second, dependency injection. Instead of middleware that mutates `req`, you declare
> `db: Session = Depends(get_db)` as a parameter. It's explicit, it's typed, and it's
> overridable in tests — which is how the whole test suite runs against a throwaway
> database.

### Q6. What is `Depends()`, really?

> A function whose return value is injected as a parameter. FastAPI resolves it before
> your handler runs, caches it per request, and — critically — you can swap it out.
>
> `get_db` yields a session and closes it in a `finally`, so cleanup is guaranteed even
> if the handler raises. `get_current_user` reads the JWT, decodes it, loads the user,
> and raises 401 if any step fails — so a route that declares
> `current_user: User = Depends(get_current_user)` is authenticated by *signature*.
> There's no way to forget the auth check, because the check is how you get the user.
>
> Compared to Express middleware: middleware runs for a route group and mutates `req`,
> which is implicit and untyped. `Depends` is per-parameter, typed, and testable.

### Q7. What does `yield` do in `get_db`?

> Makes it a generator, which FastAPI treats as setup/teardown. Everything before the
> `yield` runs before the handler, the yielded value is what gets injected, and everything
> after runs once the response is sent.
>
> ```python
> def get_db():
>     db = SessionLocal()
>     try:
>         yield db
>     finally:
>         db.close()
> ```
>
> It's the same shape as a `try/finally` around `next()` in Express, or a Python `with`
> block. The point is that the session is always closed, exception or not.

### Q8. What's Pydantic and how is it different from TypeScript types?

> TypeScript types vanish at compile time — they can't protect you from a bad request at
> runtime. Pydantic models are real objects that validate at runtime, coerce types, and
> produce structured error messages.
>
> So Pydantic is closer to Zod than to TypeScript. The difference from Zod is that
> FastAPI is wired into it: you never call `.parse()`. You annotate the parameter and
> validation happens automatically, including the 422 response shape.

### Q9. Explain `@model_validator(mode="after")`.

> A field validator only sees its own field. `mode="after"` runs once the whole model is
> populated, so it can look at several fields together.
>
> I needed it because the rule "how do I validate `value`?" depends on both `type` and
> `ttl`. If `ttl` is null the record is an alias and `value` is a DNS name; otherwise
> `value` is type-specific data. That's not expressible in a per-field validator — the
> field doesn't have access to the others.

### Q10. Where does validation live, and why is it split?

> Two layers, on a clear principle. **Anything decidable from the payload alone** goes in
> Pydantic — is this a valid IPv4, is the TTL in range, is the record type known.
> **Anything that needs another row** goes in the route layer — is there already a CNAME
> at this name, is this one of the apex NS/SOA records Route 53 manages, does this
> `(zone, name, type)` already exist.
>
> The reason is simple: a schema can't run a query. It only sees the request. So the
> split isn't stylistic, it's forced by what each layer can observe.
>
> The nice consequence is the test suite splits the same way — schema tests are fast and
> need no database, route tests are slower and need one.

### Q11. Why 404 instead of 403 for another user's zone?

> A 403 tells you the resource exists but isn't yours. That's an information leak — you
> could enumerate IDs and learn which ones are real. A 404 tells you nothing.
>
> It falls out of how the query is written anyway: every lookup filters on both `id` and
> `owner_id`, so a foreign resource simply doesn't come back and the "not found" branch
> handles it. Correct behaviour by construction rather than by an extra check.

### Q12. What is ASGI?

> The async successor to WSGI, Python's older web-server interface. WSGI is synchronous —
> one request occupies one worker until it finishes. ASGI supports async handlers,
> WebSockets and long-lived connections. FastAPI is an ASGI framework and uvicorn is the
> ASGI server that runs it.
>
> Honest caveat: my route handlers are `def`, not `async def`, because SQLAlchemy's
> sync API would block the event loop. FastAPI handles that correctly — it runs sync
> handlers in a thread pool. Getting real async end to end would mean async SQLAlchemy
> and an async driver.

*This is a strong answer specifically because of the caveat. Claiming "it's async and
therefore fast" when the handlers are sync is exactly the kind of thing a good
interviewer probes.*

---

# 3 — Database & SQLAlchemy

### Q13. Walk me through your schema.

> Three tables. **`users`** — id, email (unique), hashed password, full name.
> **`hosted_zones`** — id, name, type (Public/Private), comment, an `owner_id` pointing
> at users, and timestamps. **`dns_records`** — id, `zone_id`, name, type, ttl, value,
> routing policy, comment, timestamps.
>
> Two one-to-many relationships: a user has many zones, a zone has many records. Records
> cascade-delete with their zone through the ORM relationship.
>
> Full column-level detail is in [02-database.md](02-database.md).

### Q14. What's an ORM and why use one?

> It maps database rows to objects, so you write `db.query(HostedZone).filter(...)`
> instead of SQL strings. Three real benefits: parameterisation is automatic, so SQL
> injection isn't a thing you can accidentally do; the database is swappable, so moving
> to Postgres is a connection-string change rather than a rewrite; and relationships are
> navigable, so `zone.records` just works.
>
> The cost is that you have to know what SQL it's generating, or you write N+1 queries
> without noticing. Which I did — see the next question.

> **MERN analogy:** SQLAlchemy is Mongoose. ORM vs ODM is the only real difference.

### Q15. Do you have an N+1 query problem?

> Yes, one, and I know exactly where it is. `record_count` on the zone model is a Python
> property doing `len(self.records)`. Accessing it triggers a lazy load, so listing 20
> zones fires one query for the zones and then 20 more for their records.
>
> The fix is either eager loading with a `selectinload`, or replacing the property with a
> `column_property` backed by a COUNT subquery so the count arrives in the original query.
>
> There's an oddity worth mentioning: sorting *by* record count already uses a correlated
> COUNT subquery in SQL, because you can't ORDER BY a Python property. So the count is
> computed two different ways depending on the code path — which is exactly the sort of
> inconsistency that says "unify these."

*This is a top-tier answer. You're naming a real performance flaw in your own code,
explaining the mechanism, and giving two concrete fixes. Far stronger than "no, it's fine."*

### Q16. What's the difference between `default` and `server_default`?

> `default` is applied by Python — SQLAlchemy fills it in when the attribute is `None` at
> flush time. `server_default` becomes part of the table DDL and is applied by the
> database.
>
> The distinction cost me a day. `Column(Integer, default=300)` on `ttl` fired whenever
> the attribute was `None` — and `None` was the value that meant "this is an alias
> record." The ORM silently destroyed my sentinel on every insert.

### Q17. How do you handle migrations?

> Honestly? I don't, properly. There's a hand-rolled `run_migrations()` in `main.py` that
> runs `PRAGMA table_info` and adds `owner_id` via `ALTER TABLE` if it's missing. That was
> enough to add ownership to an existing database without losing data.
>
> It has a real defect: SQLite's `ALTER TABLE ADD COLUMN` can't add a foreign key, so on
> any database created before that change, `owner_id` has no FK and no index. And
> `create_all()` never repairs existing tables — it only creates missing ones. So the live
> schema differs from what `models.py` declares.
>
> The right answer is Alembic, which is SQLAlchemy's migration tool: versioned, ordered,
> reversible migrations. I'd add it before any second developer touched this.

### Q18. Are your foreign keys enforced?

> No — and I only found that out by checking. SQLite ships with `PRAGMA foreign_keys`
> **off** by default, per connection, and nothing in the app turns it on. So the
> `ON DELETE CASCADE` I declared is inert DDL.
>
> Deleting a zone still removes its records, but that's SQLAlchemy's `delete-orphan`
> cascade doing it in Python, not the database. Which means it works through the ORM and
> would not work if anyone wrote raw SQL.
>
> Fix is a connection-event listener that issues `PRAGMA foreign_keys=ON` on every new
> connection.

### Q19. You have a uniqueness rule. How is it enforced?

> In application code, not the database. Before inserting a record the route queries for
> an existing `(zone_id, name, type)` and rejects if one exists.
>
> That's a TOCTOU race — time of check to time of use. Two concurrent requests can both
> pass the check and both insert.
>
> And I want to be precise about why it hasn't bitten, because the easy answer is wrong.
> People say "SQLite serialises writers so it's fine" — but the lock only covers the
> *write*. The two SELECTs overlap freely, so both requests can genuinely see an empty
> result and both go on to insert. The lock makes the realistic failure mode
> `database is locked` under contention, not silent de-duplication.
>
> The correct fix is a unique index on those three columns, keeping the Python check only
> to produce a friendly error message rather than a raw integrity error.

*Note the structure: name the flaw, explain why it's currently invisible, and say what
makes it visible. That's the answer of someone who understands their own system.*

### Q20. Why SQLite? When would you move off it?

> The assignment specified it, and it's genuinely good for this: no server, one file,
> real SQL, zero setup for anyone cloning the repo.
>
> I'd move off it for any of three reasons. Concurrent writers — SQLite takes a
> database-level write lock. Horizontal scaling — you can't share one file across
> containers. Or hosted deployment with durable storage, which I hit for real: Render's
> free tier has an ephemeral filesystem, so the database is destroyed on every deploy.
> I worked around that with idempotent startup seeding, but that's a demo workaround, not
> a solution.

---

# 4 — React & Next.js

### Q21. Why Context instead of Redux?

> Five pieces of genuinely global state — auth, theme, toasts, drawers, shortcuts — and
> none of them update frequently. Redux would mean a store, actions, reducers and a
> dependency for state that fits in five small providers.
>
> Where Context stops scaling: every consumer re-renders when the provider's value
> changes, so a large, frequently-updating store causes re-renders across the tree.
> That's when you want either Redux's selector-based subscriptions or splitting into more
> contexts. I split into five for exactly that reason — theme changes don't re-render
> toast consumers.

### Q22. Why is nearly everything a client component?

> Because nearly everything is interactive and personalised — forms, tables with sorting
> and selection, modals, context consumers. Server components can't use hooks or event
> handlers.
>
> The genuine cost is that I'm not getting much out of SSR. If I were optimising, the
> zone *list* could be a server component fetching on the server, with only the
> interactive table as a client child. I didn't do it because auth is cookie-based and
> client-driven, and mixing that with server fetching adds complexity that wasn't earning
> its keep for this scope.

### Q23. How does your auth guard work?

> `AppShell` wraps every protected page. It reads `user` and `loading` from `AuthContext`.
> If loading finishes and there's no user, it calls `router.replace("/login")`.
>
> The detail that matters: while `loading` is true it renders an empty background, not the
> page. Otherwise protected content flashes on screen for a moment before the redirect
> fires. And it's `replace`, not `push`, so the back button doesn't bounce you into a
> redirect loop.
>
> This is client-side, which means it's a UX guard, not a security boundary. The real
> enforcement is the API returning 401 — the client guard just stops you seeing an empty
> shell.

*That last paragraph is the whole answer. Anyone who says "the frontend checks auth" without
it has missed the point.*

### Q24. How does debounced search work?

> The load function is wrapped in `useCallback` keyed on the query inputs. An effect
> depends on that function and does `setTimeout(load, search ? 300 : 0)` with a
> `clearTimeout` in the cleanup.
>
> So each keystroke changes `search`, which gives `load` a new identity, which re-runs the
> effect, whose cleanup cancels the previous timer. Only the last keystroke in a 300ms
> window survives. Paging and sorting use a 0ms delay because those should feel instant.
>
> The part that's easy to miss: this only works because everything `load` closes over is
> stable. `notify` comes from context as a `useCallback`, so it doesn't change identity
> every render. If it did, `load` would be recreated on every render, the effect would
> re-run every render, and the debounce would collapse into a request per render.

### Q25. What's a hydration mismatch? Did you hit one?

> Next.js renders HTML on the server, ships it, then React runs the same components in
> the browser and attaches to the existing DOM. That attach is hydration, and it assumes
> both trees match. When they don't, React warns and may throw away the subtree and
> re-render it.
>
> I hit one on every page. The Cloudscape modal component mounts a React portal even while
> hidden, and a portal renders into `document.body` — which doesn't exist during server
> rendering. Since the keyboard-shortcuts modal is always mounted so `?` works anywhere,
> every page had a client-only node the server HTML didn't have.
>
> Fix was `if (!open) return null` in the modal wrapper. Nothing renders until it's
> actually opened, so both trees agree.
>
> The general rule: anything touching `window`, `document`, `localStorage`, `Date.now()`
> or `Math.random()` during render is a hydration hazard.

### Q26. `useRef` vs `useState` — give me a real example from your code.

> `DrawerContext` has `const dismissed = useRef(false)`. It tracks whether the user has
> manually closed the details panel, so it doesn't auto-reopen on the next selection.
>
> It's a ref because nothing on screen depends on it. Making it state would trigger a
> re-render every time it flipped, for no visual change. Ref when you need a value that
> survives renders but doesn't drive them; state when the UI has to react.

### Q27. Why do you have a service layer instead of calling axios in components?

> Three reasons. The components never see the wire format — the service maps `sortBy` to
> `sort_by`, so a rename on the API touches one file. Every call gets the same base URL,
> credentials and interceptors without repetition. And swapping axios for `fetch`, or
> adding React Query later, is a change in one module.
>
> Same instinct as keeping SQL out of route handlers: one layer knows the protocol,
> everything above it works in domain terms.

### Q28. How do you handle errors from the API?

> A single `apiError()` helper normalises them, because FastAPI returns two different
> shapes: `{"detail": "..."}` for `HTTPException`, and `{"detail": [{loc, msg, type}, ...]}`
> for Pydantic 422s. Components shouldn't have to know that.
>
> Then a consistent convention: a failed *load* becomes a toast, since there's no field to
> attach it to. A successful *mutation* becomes a toast. A failed mutation shows inline in
> the form when there is a form, and a toast when there isn't.

### Q29. How is dark mode implemented without a flash?

> Three coordinated pieces. An inline script in the root layout runs *before* first paint,
> reads the stored preference, and sets the class on `<html>`. A `ThemeContext` keeps
> React's state in sync and persists changes. And the styles are CSS custom properties
> that get redefined under the dark class.
>
> The inline script is the whole trick. If you set the theme in a `useEffect`, that runs
> after hydration — so the page paints light, then flips. The blocking script means the
> correct theme is applied before anything is drawn.

### Q30. Why no React Query or SWR?

> Not enough surface to justify it. Around a dozen fetch sites, no cross-page cache
> sharing, no optimistic updates, no background refetch requirement.
>
> What I'd get if I added it: caching, deduplication, automatic refetch on focus, and
> loading/error state I currently write by hand in every page. If this grew another five
> screens I'd add it — the hand-rolled loading and error state is the part that scales
> worst.

---

# 5 — Auth & security

*Full detail in [09-auth-and-security.md](09-auth-and-security.md).*

### Q31. Walk me through login.

> The client posts email and password. The backend loads the user by email and verifies
> the password with bcrypt. On success it signs a JWT with the user id and an expiry, sets
> it as an httpOnly cookie, and also returns it in the body as a Bearer fallback.
>
> Subsequent requests carry the cookie automatically. `get_current_user` decodes the JWT,
> loads the user, and 401s if the token is missing, expired or tampered with.
>
> On page load the client calls `/auth/me` to restore the session, which is why a refresh
> keeps you logged in.

### Q32. Why bcrypt and not SHA-256?

> Because SHA-256 is designed to be *fast*, which is exactly wrong for passwords — fast
> means an attacker with the hash file can try billions per second.
>
> bcrypt is deliberately slow and has a tunable work factor you can raise as hardware gets
> faster. It also salts automatically, so two users with the same password get different
> hashes, which defeats rainbow tables.

### Q33. Why httpOnly cookie instead of localStorage?

> `localStorage` is readable by any JavaScript on the page. One XSS bug and the token is
> gone. An httpOnly cookie is invisible to JavaScript, so the same XSS can't read it.
>
> The trade-off is CSRF: cookies are sent automatically, so another site can trigger an
> authenticated request. `SameSite` mitigates it — but in production this app needs
> `SameSite=None` because the frontend and API are on different domains, which weakens
> that protection. A production system would add CSRF tokens.
>
> Neither storage option is strictly safer; you're choosing which attack you'd rather
> defend against, and I'd rather defend CSRF than XSS token theft.
>
> And I have to add a caveat, because I found this auditing my own code: the backend sets
> an httpOnly `access_token` cookie, but the *frontend* separately writes the same JWT
> into an `r53_token` cookie via js-cookie so it can attach a Bearer header. js-cookie
> writes from JavaScript, so that one can't be httpOnly. Which means the token *is*
> readable by script — the httpOnly flag is doing no real work in the browser. The fix is
> to delete the frontend's copy and rely on `withCredentials`, which already sends the
> httpOnly cookie and which the backend already prefers.

*The last paragraph is what makes this a senior answer. Reciting the httpOnly/localStorage
trade-off is textbook; noticing that your own implementation defeats it is not.*

### Q34. What's actually inside a JWT?

> Three base64url segments separated by dots: header (algorithm), payload (the claims —
> here the user id and an expiry), and signature.
>
> The critical thing people get wrong: the payload is **encoded, not encrypted**. Anyone
> can read it. The signature only proves it wasn't modified. So you never put anything
> secret in a JWT — mine holds a user id and an expiry, both harmless.

### Q35. How do you isolate one account's data from another's?

> Every hosted zone has an `owner_id`, and every query filters on it — around seven sites
> across the route files. Records are reached through their zone, so ownership is checked
> there too.
>
> The weakness is that it's repeated rather than centralised. Adding an endpoint and
> forgetting the filter would leak data across tenants, and nothing would fail. A better
> design puts the scoping in one place — a dependency that returns an already-scoped
> query, so an unscoped one isn't reachable.

### Q36. What are the security gaps?

> Named honestly, biggest first: **the httpOnly cookie is undermined by a second,
> JS-readable copy of the same token** that the frontend writes for its Bearer header —
> so an XSS could still steal a session. Then: no rate limiting on login, so it's
> brute-forceable. No refresh tokens — the session just dies at 24 hours. No password
> complexity rules beyond a length minimum. No CSRF tokens, which matters more given
> `SameSite=None` in production. No account lockout. And no audit log.
>
> For a demo with a seeded account that's an acceptable scope. For anything real, rate
> limiting on `/login` is the first thing I'd add, because it's the cheapest fix for the
> highest-likelihood attack.

---

# 6 — Testing

*Full detail in [10-deployment-and-testing.md](10-deployment-and-testing.md).*

### Q37. What does your test suite cover?

> 226 pytest tests in four files. 48 on validation schemas, 26 on startup seeding safety,
> 24 on route-layer business rules, 8 on the BIND zone-file parser.
>
> A detail I like: the schema tests use AWS's own published record examples as fixtures.
> So they don't test "does the code do what I wrote," they test "does the code match the
> spec."
>
> And a gap I'll state plainly — there are no frontend tests. The UI was verified by
> driving a real browser, which proves it worked once but catches nothing on the next
> change.

### Q38. How do you test database code?

> Dependency overrides. `get_db` is a FastAPI dependency, so tests replace it with one
> yielding a session bound to a throwaway SQLite file in a pytest `tmp_path`. Real SQL,
> real engine, fresh database per test, zero risk to real data.
>
> One subtlety worth mentioning: the tests build a bare `FastAPI()` from the routers
> rather than importing `app.main`, because `main` runs `create_all()` and the startup
> seeding at import time — against the real database. Module-level side effects make a
> module unimportable in tests, and that's a design lesson as much as a test one.

### Q39. When do you write tests?

> Two triggers here. After a bug, always — all eight parser tests exist because of one
> bug, and they fence the whole area rather than just reproducing the one failure. And
> before shipping anything that runs unattended, which is why the seeding code has 26
> tests: it runs on every production boot with nobody watching.

### Q40. What's your coverage percentage?

> I don't have a number and I'd rather say that than guess. What I can tell you is what's
> covered — validation, route rules, seeding, the parser — and what isn't: the entire
> frontend, and auth directly. Auth is the highest-risk area with the least direct
> coverage, so that's where I'd start.

---

# 7 — Debugging

*All seven war stories are in [07-bugs-and-debugging.md](07-bugs-and-debugging.md).*

### Q41. Describe a hard bug.

**Use the alias/TTL bug (Q3).** It's short, genuinely subtle, and the fix demonstrates
design rather than patching.

### Q42. Tell me about a time you broke something.

> I fixed a scrolling bug by making the header `position: fixed`. The scroll problem went
> away and my checks said the page was intact.
>
> Then I looked at a screenshot. The layout below had expanded into the space the header
> vacated and was painting *over* it — the page heading, the nav title and the action
> buttons were all hidden underneath. My assertions passed because Playwright's
> `is_visible()` means "in the DOM with a non-empty box," and an element covered by
> another element satisfies that.
>
> I reverted and used a clamped flex column instead: fixed-height outer container, header
> and footer at natural height, layout takes the rest and scrolls internally.
>
> The lesson I actually took: assert on what the user experiences. Four of my assertions
> across this project were wrong for that class of reason, and every one was caught by a
> screenshot or a network log rather than a DOM query.

### Q43. How do you approach debugging generally?

> Reproduce it small first — I got one bug from a 40-line zone file down to four lines
> before I understood it. Then narrow by layer before line: for the TTL bug I read the row
> straight from SQLite instead of through the API, which eliminated half the system in one
> check. Let scope tell you where to look — broken on every page means shared code, broken
> on one page means that page. Distrust your own assertions. Fix the cause, not the
> symptom. Then pin it with a test, and leave a comment saying what breaks if someone
> undoes it.

### Q44. Have you dealt with a security incident?

> A small one, in this repo. It had no `.gitignore`, so `venv/`, `__pycache__`, the
> database and `.env` were all committed — about 3,700 files, including the live
> `SECRET_KEY` used to sign JWTs.
>
> I added the `.gitignore`, untracked the files with `git rm -r --cached`, and — the part
> that actually matters — **rotated the secret**. Removing a file from the working tree
> doesn't remove it from history; anyone with a clone still has the old value. A leaked
> secret is only fixed by making the leaked value worthless.
>
> Production now gets its key generated by Render at provision time, so no human ever
> sees it.

---

# 8 — Scaling & trade-offs

### Q45. This gets 10,000 users tomorrow. What breaks first?

> In order.
>
> **SQLite's write lock.** It serialises writers at the database level. That's the wall,
> and it's not tunable — it's Postgres or bust.
>
> **The `record_count` N+1.** Listing zones fires one query plus one per zone. Fine at 20
> zones, not at 20,000 users hitting it.
>
> **No horizontal scaling.** One container, and SQLite prevents adding another because
> they can't share a file.
>
> **No caching anywhere.** Every list hits the database.
>
> Fix order: Postgres first, because it unblocks everything else. Then the N+1. Then
> multiple instances behind a load balancer. Then Redis for hot reads.

### Q46. How would you add DNS resolution?

> Different problem to the one I solved, and I'd say so first. This app is the control
> plane — where records are managed. Serving lookups is the data plane.
>
> You'd need a UDP listener on port 53 speaking the DNS wire protocol, which is binary,
> not JSON. It'd read from the same store but almost certainly through a cache, because
> resolution has to answer in single-digit milliseconds and a database round trip per
> query won't do it. And it'd need to be geographically distributed and anycast-routed,
> which is most of what you're actually paying Route 53 for.

### Q47. What's the worst piece of code in this project?

> A few candidates, and I'd rather name them than be found out.
>
> `run_migrations()` in `main.py` — a hand-rolled `ALTER TABLE` guarded by a `PRAGMA`
> check. It works and it's honest about being a stopgap, but it left the live schema
> drifting from the model definitions.
>
> The repeated `owner_id` filter across seven sites. Correct everywhere today; one missed
> filter tomorrow silently leaks data across tenants.
>
> And there's dead code I know about: `lib/auth.ts` is imported by nothing and defines a
> *different* cookie than the live one, and `lucide-react` is a dependency that's never
> imported. Both should be deleted — leftovers from moving fast.

*Volunteering dead code you know about reads as ownership. Having it found for you reads
as not knowing your own codebase.*

### Q48. If you had another week?

> Day one: Postgres and Alembic — everything else is easier afterwards. Day two: kill the
> N+1 and add the missing indexes. Day three: centralise tenant scoping into a dependency
> so it can't be forgotten. Day four and five: frontend tests, Testing Library for
> validation and Playwright for the four CRUD flows. Day six: CI running both suites. Day
> seven: rate limiting and refresh tokens.
>
> Notice none of that is features. The app does what it was asked to do — the week goes
> into the things that stop it from being maintainable by someone who isn't me.

---

# 9 — Behavioural

### Q49. You'd never used Python or FastAPI. How did you get productive?

> By mapping it onto what I knew instead of learning it from scratch. FastAPI is Express
> with typed routes, Pydantic is Zod wired into the framework, SQLAlchemy is Mongoose for
> SQL, `requirements.txt` is `package.json`.
>
> That gets you 80% of the way and it's the wrong 80% to trust blindly — the places where
> the analogy *breaks* are where the bugs were. SQLAlchemy's `default=` behaving nothing
> like a JavaScript default parameter cost me a day. So the method was: use the analogy to
> move fast, then verify anything that surprises you against the actual behaviour rather
> than the assumed one.

### Q50. How do you decide what to build and what to skip?

> This project had optional bonuses. I did the ones that showed something — zone-file
> import and export, because parsing a real format is genuine work; keyboard shortcuts and
> dark mode, because they're console parity. I explicitly skipped actual DNS resolution
> and put that scope boundary in the README rather than leaving it ambiguous.
>
> Some console features exist as "coming soon" pages — health checks, traffic policies,
> the resolver. Those are navigation parity, and labelling them honestly beats either
> hiding them or half-implementing them.

### Q51. Give me an example of feedback you acted on.

> A few. I was told a scrollbar I'd implemented didn't match the console — thin at rest,
> thicker on hover. I'd assumed I needed to tune my custom scrollbar CSS. Checking the
> reference properly, the answer was to *delete* the override entirely and let the
> platform's native behaviour through. The fix was removing code, not adding it.
>
> Another: I'd diagnosed a side-navigation problem as a scrollbar issue, and was told it
> was still wrong. It turned out the whole document was scrolling and dragging the nav up
> under the header — a completely different cause. I'd been fixing the thing I'd already
> decided was the problem instead of re-examining the symptom.

---

# 10 — Questions to ask them

Have three or four ready. Not asking any is a bad signal.

- How is the team structured, and how do features move from idea to production?
- What does code review look like here — what does a reviewer usually push back on?
- What's the testing culture? Is there a coverage bar, or is it judgement-based?
- What's the most annoying piece of technical debt in the codebase right now?
- If I joined, what would a good first three months look like?
- What's something the team changed its mind about in the last year?

The technical-debt one is the best of these. Every codebase has debt; how someone talks
about theirs tells you more about the engineering culture than any other question.

---

## Final checklist before the interview

- [ ] Can you explain what DNS is, and what a hosted zone and a record are, in 30 seconds
      to a non-technical person?
- [ ] Can you name your three biggest technical weaknesses **before** they ask?
      *(N+1 on record_count · uniqueness enforced in Python, not the DB · no frontend tests)*
- [ ] Can you tell the alias/TTL bug story in 90 seconds without notes?
- [ ] Can you draw the request-flow diagram on a whiteboard?
- [ ] Do you know why 404 and not 403?
- [ ] Do you know why bcrypt and not SHA-256?
- [ ] Do you know why the cookie is httpOnly and what that trades away?
- [ ] Can you say "I don't know" out loud without it feeling like a loss?

That last one is the most important line in this file.
