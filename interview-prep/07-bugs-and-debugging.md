# 07 — Bugs & War Stories

> ### TL;DR — the 5 things you must be able to say
>
> 1. **The BIND parser corrupted data silently** — one pass stripped the indentation a later pass needed, so a class token became a record name. Eight regression tests now pin it.
> 2. **`Column(Integer, default=300)` made alias records impossible** — SQLAlchemy's `default=` fires when the attribute is `None` at flush time, and `None` was the value carrying the meaning.
> 3. **Fixing that unmasked a second bug** — an alias's value isn't rdata for its type, so the per-type validator wrongly rejected it. Verify the *outcome*, not the diff.
> 4. **A hydration mismatch on every page** — a Cloudscape modal mounts a portal even while hidden, and the server HTML has no portal. Fix: `if (!open) return null`.
> 5. **My own passing assertions lied four times.** `is_visible()` is true for an element completely covered by another. Assert on pixels and network logs, not the DOM.
>
> **Read all of it (~20 min)** — this file is narrative, not reference. There is nothing to skip.

> **This is the most valuable file in the folder.**
>
> Anybody can list features. Almost nobody can walk an interviewer through a bug they
> found, how they proved it was real, and what they changed. That's the conversation
> where senior engineers separate themselves — because it shows *method*, not memory.
>
> Every bug below actually happened in this repo. Each one is written as:
> **symptom → investigation → root cause → fix → lesson.**

---

## How to use this file

Memorise **two or three** of these properly rather than skimming all seven. The two
strongest are:

- **Bug 2 — the invisible ORM default** (a one-word change; explains data modelling,
  ORM internals, and "the ORM is not a thin wrapper")
- **Bug 4 — the hydration mismatch** (explains SSR, React reconciliation, and portals)

Bug 1 is the best "I found a *data-corruption* bug" story if you want to lead with
correctness. Bugs 5 and 6 are the best "I broke it myself and caught it" stories —
and admitting a self-inflicted bug reads far better than pretending none existed.

---

<a id="bug-1"></a>

## Bug 1 — The BIND parser silently created a record named `IN.example.com.`

**Severity:** data corruption. Wrong rows written to the database, no error raised.

### Background you need first

A **BIND zone file** is the standard plain-text format for DNS records. Importing one
was an optional bonus in the assignment. The format has a rule that makes it deceptively
hard to parse (RFC 1035):

> If a line **starts with whitespace**, it has no owner name of its own — it reuses the
> owner name from the line above.

```
example.com.    3600 IN SOA  ns1.example.com. admin.example.com. 1 7200 900 1209600 86400
                3600 IN NS   ns1.example.com.        ← indented: owner is example.com.
www             3600 IN A    192.0.2.1               ← not indented: owner is www
```

So indentation is *semantic*. Losing it changes the meaning of the file.

The parser also has to handle **parenthesised multi-line records**, where one logical
record is spread over several physical lines:

```
example.com. 3600 IN SOA ns1.example.com. admin.example.com. (
                1       ; serial
                7200    ; refresh
                900 1209600 86400 )
```

### Symptom

Importing a normal zone file produced an extra record whose **name was `IN.example.com.`**
and whose type was garbage. No exception, no error in the response — just a wrong row.

### Investigation

I wrote the smallest zone file that reproduced it and ran the parser directly, printing
the intermediate list rather than the final records. The folding step was where it went
wrong: the parser's step 1 folds parenthesised lines into a single logical line and
**strips** it. Step 2 then asks "does this line start with whitespace?" — but by then the
whitespace has been thrown away by step 1.

So every folded record looked un-indented. The parser concluded the first token was an
owner name and popped it off. For a continuation line like `3600 IN NS ns1.example.com.`,
after the TTL was consumed the next token was the *class* `IN` — which got promoted to an
owner name, producing `IN.example.com.`

### Root cause

**A property of the input was consumed by one pass and needed by a later pass.** The
indentation flag had to travel *with* each folded line, not be re-derived from the
folded text.

### Fix

`backend/app/services/bind_parser.py:54-72` — the logical-line list became a list of
`(text, was_indented)` tuples, capturing the flag from the **first** physical line of a
record, before folding destroys it:

```python
logical_lines: List[tuple[str, bool]] = []
buffer = ""
buffer_indented = False
depth = 0
for raw in text.splitlines():
    line = _strip_comment(raw)
    if not line.strip() and depth == 0:
        continue
    if not buffer:                              # ← first physical line of this record
        buffer_indented = raw[:1].isspace()     # ← capture indentation before it's lost
    depth += line.count("(") - line.count(")")
    ...
    if depth <= 0:
        logical_lines.append((buffer.strip(), buffer_indented))
```

and step 2 consumes the flag instead of re-deriving it (`bind_parser.py:79`, `:100`):

```python
for line, starts_with_ws in logical_lines:
    ...
    if starts_with_ws:
        name = last_name          # inherit the previous owner
    else:
        name = _qualify(tokens.pop(0), origin)
```

### Verification

Eight regression tests in `backend/tests/test_bind_parser.py`, each pinning one rule:

| Test | What it pins |
| --- | --- |
| `test_indented_line_inherits_previous_owner_name` | the core rule |
| `test_class_token_is_never_treated_as_an_owner_name` | the exact corruption |
| `test_explicit_owner_names_are_unaffected` | no regression on normal lines |
| `test_parenthesised_record_keeps_its_explicit_owner` | folding doesn't break the un-indented case |
| `test_indented_line_following_a_folded_record_inherits_the_apex` | the original failure |
| `test_origin_and_ttl_directives_apply` | `$ORIGIN` / `$TTL` |
| `test_comments_outside_quotes_are_stripped_but_kept_inside_txt` | `;` inside a TXT value is data, not a comment |

### Lesson

*Silent* bugs are worse than loud ones. This threw no exception — it just wrote wrong
data. When a parser has multiple passes, ask at every boundary: **what information did
the previous pass destroy, and does anything downstream still need it?**

---

<a id="bug-2"></a>

## Bug 2 — Alias records were impossible, because of one ORM default

**Severity:** an entire feature quietly didn't work.

### Background

In Route 53, an **alias record** points at an AWS endpoint (a load balancer, a
CloudFront distribution) instead of holding rdata. Alias records **have no TTL** —
Route 53 uses the TTL of whatever they point at.

This clone encodes that as `ttl IS NULL`. NULL TTL *means* "this is an alias."

### Symptom

Create an alias record in the UI. It saves without error. Reopen it — TTL is `300` and
it's no longer an alias.

### Investigation

I read back the row directly from SQLite rather than through the API, because the API
serialises through Pydantic and I wanted to rule the response model out. The stored
value really was `300`. So the write path was wrong, not the read path.

Next question: who set it? The request payload had `ttl: null`. The Pydantic model
passed `None` through. So it changed *between* the schema and the disk — i.e. inside
SQLAlchemy.

The column was declared:

```python
ttl = Column(Integer, default=300)
```

### Root cause

**`default=` in SQLAlchemy is not a "when the column is missing" default — it's a
"when the Python attribute is `None` at flush time" default.**

That distinction is everything. Because `None` is exactly the value that carried our
meaning, the ORM overwrote our signal with `300` on every single insert. The alias
feature could never work.

> **MERN analogy:** identical trap in Mongoose. `{ ttl: { type: Number, default: 300 } }`
> fires whenever the field is `undefined` — so you can't use "absent" to mean anything.

### Fix

`backend/app/models.py:73-77` — remove the column default and document *why*, so nobody
helpfully adds it back:

```python
# No column default: SQLAlchemy applies one whenever the attribute is None at
# flush time, which silently rewrote the NULL that marks an alias record as 300.
# RecordCreate.ttl already defaults to 300 when the client omits it, so the only
# case the column default served is still covered.
ttl = Column(Integer, nullable=True)
```

The key half of that comment is the last sentence: the default wasn't just removed, it
was **relocated to the layer that can tell the two cases apart.** Pydantic sees the raw
request, so it knows the difference between "client omitted `ttl`" (→ 300) and "client
explicitly sent `null`" (→ alias). SQLAlchemy sees neither — by flush time both look
like `None`.

### Lesson

Two things:

1. **Layer the default where the information still exists.** A default applied too deep
   in the stack destroys the distinction it needed to respect.
2. **Sentinel values are a design decision with consequences.** Once `NULL` carries
   meaning, every layer that might rewrite `NULL` becomes a hazard. The alternative — an
   explicit `is_alias` boolean — is less elegant but has no such trap.

### If they ask: "Would you use NULL as a sentinel again?"

For this project yes, because it mirrors the real Route 53 API and the interviewer can
check that. In a system I owned end to end I'd add the boolean, because the cost of the
sentinel is that *every* layer has to be audited for it — and I found that out the hard
way.

---

<a id="bug-3"></a>

## Bug 3 — Fixing bug 2 exposed bug 3: alias records now rejected with 422

**Severity:** feature still broken, new failure mode.

### Symptom

With the column default gone, `ttl: null` finally reached the database — but now the API
returned **422 Unprocessable Entity** before it ever got there. An alias `A` record
pointing at `dualstack.my-lb-123.us-east-1.elb.amazonaws.com.` was refused.

### Investigation

422 in FastAPI means validation, so the failure was in `schemas.py`. The record validator
runs `validate_record_value(self.type, self.value)`, and for type `A` that enforces "must
be a valid IPv4 address." An ELB hostname is not an IPv4 address — so it was correctly
rejected by a rule that shouldn't have applied at all.

### Root cause

**The value of an alias record isn't rdata for its type.** For a normal `A` record the
value is an IPv4 address. For an *alias* `A` record it's a DNS name. Same `type` column,
two completely different value grammars — and the validator only knew about one.

### Fix

A separate validator, and a branch on the alias marker.
`backend/app/schemas.py:513-532`:

```python
def validate_alias_target(value: str) -> str:
    """Validate an alias record's target.

    An alias record's value is the DNS name of an AWS endpoint (or of another record in the
    same hosted zone), not type-specific rdata — Route 53 answers with the target's value and
    uses the target's TTL, which is why alias records carry no TTL of their own. Applying the
    per-type rdata rules here would reject a perfectly valid alias, e.g. an A-type alias
    pointing at an ELB hostname.
    """
```

and `backend/app/schemas.py:607-619`:

```python
@model_validator(mode="after")
def check_name_and_value(self):
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

Note `mode="after"`: it runs once **all** fields are populated, so it can see `ttl` and
`type` and `value` together. A per-field validator can only see its own field, so this
rule is impossible to express there.

> **MERN analogy:** `mode="after"` is a Mongoose `pre('validate')` hook on the whole
> document, versus a per-path validator that only sees one field.

### Lesson

**Fixing one bug often unmasks the next one in the same chain.** Bug 2's symptom
(TTL becomes 300) was *hiding* bug 3, because a record with `ttl=300` took the normal
validation branch and passed. I only found bug 3 by re-testing the full flow after
fixing bug 2 rather than assuming the fix completed the feature — verify the *user
outcome*, not the diff.

---

<a id="bug-4"></a>

## Bug 4 — A hydration mismatch on every single page

**Severity:** a React error on every route. Cosmetically invisible, structurally alarming.

### What a hydration mismatch is

Next.js renders your React tree to HTML on the server, ships that HTML so the page
paints instantly, then React runs the same components in the browser and **attaches**
to the existing DOM. That attach step is *hydration*. It assumes the tree React builds
in the browser matches the HTML the server sent. If they differ, React logs a hydration
mismatch and may discard and re-render the subtree — so you lose the SSR benefit and
can get flicker or lost DOM state.

### Symptom

`Hydration failed because the server rendered HTML didn't match the client` in the
console on every page.

### Investigation

"On every page" was the clue. Something in the *shared* tree, not any one route. The
shared tree is `providers.tsx` → `AppShell`. The one component always mounted regardless
of route is the keyboard-shortcuts modal, rendered unconditionally by `ShortcutsProvider`
so <kbd>?</kbd> works anywhere.

The modal is a Cloudscape `Modal`, and Cloudscape's Modal **mounts a React portal even
while `visible={false}`.** A portal renders into `document.body` — which does not exist
during server rendering. So the server produced no placeholder and the client produced
one. Guaranteed mismatch, on every page, forever.

**And I had caused it**, by swapping the repo's hand-rolled dialog for the Cloudscape one.

### Fix

`frontend/src/components/ui/Modal.tsx:29-33`:

```tsx
// Cloudscape's Modal mounts a Portal even while hidden, and the placeholder it injects
// is absent from the server HTML — which produced a hydration mismatch on every page,
// since the shortcuts modal is always mounted by ShortcutsProvider. Rendering nothing
// until the dialog is actually opened avoids that and keeps closed dialogs out of the DOM.
if (!open) return null;
```

Three lines of comment for one line of code, and that ratio is correct: the line looks
like a pointless micro-optimisation to the next reader, so the comment has to carry the
reason.

### The part worth telling

Earlier in the same session I was *offered* this exact guard and **declined it**, because
at that moment there was no evidence it was needed and the rule I was working under was
"no line of code without justification." When the hydration error appeared in the console,
that was the justification, and the guard went in.

That's not a story about being wrong. It's a story about **the bar for adding code being
evidence, and evidence arriving later.** Interviewers like that answer a lot more than
"I always add defensive guards."

### Lesson

- A bug on *every* page is a bug in *shared* code — start at the root, not the route.
- Anything that touches `document` or `window` (portals, `localStorage`, `Date.now()`,
  `Math.random()`) is a hydration hazard by construction.
- The standard escapes: render nothing until mounted (what we did), `next/dynamic` with
  `ssr: false`, or `suppressHydrationWarning` for genuinely unavoidable cases like
  timestamps.

---

<a id="bug-5"></a>

## Bug 5 — "Sign out" became unclickable

**Severity:** users could not log out. Also self-inflicted.

### Symptom

The account dropdown in the top nav opened and rendered correctly — but clicking
**Sign out** did nothing. No error. The element was visible on screen.

### Investigation

Visible ≠ clickable. The two things that break a click on a visible element are
`pointer-events` and **something else painting on top of it.** I checked what was at
that coordinate rather than trusting the DOM tree — a different element was receiving
the click.

I had just restructured `AppShell` into a fixed-height flex column to fix a scrolling
problem. `TopNav` was a plain `<div>` in that column with no `position`, so it created
no stacking context. Its dropdown is absolutely positioned and **overhangs the layout
below it** — and `AppLayoutToolbar`, later in DOM order, painted over the overhang and
swallowed the clicks.

### Root cause

**`z-index` only applies to positioned elements.** A `static` element can't be lifted
above a later sibling no matter what `z-index` you give it. The dropdown *looked* on top
because it was drawn — but hit-testing follows paint order, and the layout won.

### Fix

`frontend/src/components/layout/AppShell.tsx:107-112`:

```tsx
{/* Needs its own stacking context above AppLayout: TopNav's dropdowns (account menu,
    Regions, settings) are absolutely positioned and overhang the layout below, which
    otherwise paints over them and swallows clicks — Sign out became unclickable. */}
<div id="console-top-nav" style={{ position: "relative", zIndex: 1002 }}>
  <TopNav />
</div>
```

`position: relative` with no offsets moves nothing — it exists purely to make the
`z-index` take effect.

### Lesson

When a visible element doesn't respond to clicks, stop reading the DOM and start asking
**what is at that pixel.** And remember `z-index` is inert on `position: static`.

---

<a id="bug-6"></a>

## Bug 6 — I fixed the scroll, and broke the entire header

**Severity:** the page heading, nav title and action buttons disappeared. Caught before commit.

### Symptom

The reported problem: *"the nav bar is glitched everywhere, it happens after scrolling."*
The document itself was scrolling, dragging the side navigation up underneath the header.

### First attempt (wrong)

I took the header out of flow with `position: fixed`. The scrolling stopped. My checks
said the elements were still present and `is_visible()` returned `true`.

Then I looked at a screenshot. **`AppLayoutToolbar` had expanded to fill the space the
header no longer occupied, and was overlapping it** — swallowing the nav title, the page
heading, and the action buttons. They were in the DOM and technically "visible" by
Playwright's definition, which is why my assertions passed. They were underneath another
element.

### Correct fix

Don't remove the header from flow. Clamp the **outer container** so nothing scrolls, and
let the layout scroll internally. `frontend/src/components/layout/AppShell.tsx:99-106`:

```tsx
/* The shell is a fixed-height column that never scrolls: TopNav and the footer take their
   natural height, and AppLayoutToolbar fills the gap and scrolls internally.
   Left in normal flow on purpose — taking the header out of flow with `position: fixed`
   makes AppLayout overlap it and swallow the page heading and nav title, while leaving
   the document free to scroll drags the whole side navigation up under the header
   (the reported "nav is glitched after scrolling"). Clamping the outer column instead
   keeps both fixed. */
<div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
```

with `flex: 1, minHeight: 0` on the middle section (`AppShell.tsx:114`) so the layout
takes the remaining height and scrolls inside itself. `minHeight: 0` is the part people
miss — flex items default to `min-height: auto`, which refuses to shrink below content
size and lets the child push the container taller than the viewport.

### Lesson — and the wider one about testing

**`is_visible()` is not "the user can see it."** Playwright's definition is roughly "in
the DOM, non-empty box, not `display:none`/`visibility:hidden`." An element covered by
another element passes that check.

Across this project **four of my own test assertions were false negatives or false
positives** for exactly this class of reason:

| Wrong assertion | Why it lied |
| --- | --- |
| `is_visible()` on the heading | passes for an element covered by another element |
| selector for the form heading | matched the breadcrumb with the same text |
| "split panel unmounted" | Cloudscape *collapses* it; it stays in the DOM |
| "zone delete failed" | the selector matched the success toast |

Every one was caught by checking **pixels or network traffic** rather than the DOM. That
generalises: *assert on the thing the user experiences, not on a proxy for it.* A
screenshot and a network log are ground truth; a DOM query is an interpretation.

---

<a id="bug-7"></a>

## Bug 7 — 3,736 junk files and a secret in git history

**Severity:** security + repo hygiene. Not a code bug, but the one with real-world consequences.

### Symptom

The repo had no `.gitignore`. `venv/`, `__pycache__/`, `*.db` and `.env` were all
committed — **3,736 files**, including a live `SECRET_KEY` (the value used to sign JWTs).

Separately: the entire `frontend/` directory was **untracked**. The project had been
pushed with no frontend in it at all.

### Fix

1. A root `.gitignore` covering `venv/`, `__pycache__/`, `*.db`, `.env`, `.next/`,
   `node_modules/`.
2. Untracked the 3,736 files with `git rm -r --cached` (removes from the index, keeps
   them on disk).
3. **Rotated the secret.** This is the non-negotiable step. Removing a secret from the
   working tree does not remove it from history — anyone with a clone still has it.
   A leaked key is only fixed by making the leaked value worthless.
4. Committed the frontend.

### Lesson

- **`.gitignore` before the first commit, not after.** After is cleanup; before is prevention.
- **A leaked secret is leaked forever.** Deleting the file changes nothing; rotation is
  the only fix.
- The JWT signing key is the highest-value secret in a system like this. With it you can
  mint a token for any user — it's not "a password," it's *every* password.
- On this project the secret now comes from `SECRET_KEY` in the environment, generated
  by Render (`render.yaml:23-24`, `generateValue: true`) so no human ever sees or commits it.

---

## The debugging method, generalised

If they ask *"walk me through how you debug something"*, this is the answer these seven
bugs actually demonstrate:

1. **Reproduce it in the smallest possible input.** The BIND bug went from a 40-line zone
   file to four lines before I understood it.
2. **Find the layer, then the line.** Bug 2: is it the write path or the read path? Read
   the row straight from SQLite and the question answers itself — one check eliminated half
   the system.
3. **Scope tells you where to look.** Broken on *every page* → shared code. Broken on
   *one* page → that page.
4. **Distrust your own assertions.** Four of mine were wrong. Verify against pixels and
   network logs, not the DOM.
5. **Fix the cause, not the symptom.** Bug 2's real fix wasn't "remove the default", it
   was "move the default to the layer that can still tell the cases apart."
6. **Pin it with a test.** Eight tests exist because of bug 1. That bug cannot come back
   silently.
7. **Leave the reason behind.** Every fix above carries a comment explaining what breaks
   if you undo it — because each looks removable to someone who wasn't there.

---

## If they ask…

**"What's the hardest bug you've fixed?"**
Lead with **Bug 2**. It's short, the root cause is genuinely subtle, and the fix
demonstrates layered design rather than a patch. Then mention that fixing it revealed
Bug 3, which shows you verified the outcome instead of the diff.

**"Tell me about a time you broke something."**
**Bug 6**, told straight: I fixed a scroll problem with `position: fixed`, my assertions
said it was fine, the screenshot said otherwise, I reverted and used a clamped flex
column instead. The point of the story is that *I didn't trust the passing test.*

**"How do you know your fix actually worked?"**
Bug 1 → eight regression tests. Bug 2 → read the row back from SQLite, not the API.
Bug 3 → exercised the full create-then-reload flow in the browser. Different bugs need
different evidence, and picking the right evidence is the skill.

**"Have you dealt with a security issue?"**
**Bug 7.** The interesting part isn't the `.gitignore` — it's knowing that removing a
secret from the working tree does nothing, and that rotation is the only real fix.
