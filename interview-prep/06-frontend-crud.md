# 06 — Frontend Hooks, CRUD Flows and Data Layer

> ### TL;DR — the 6 things you must be able to say
>
> 1. **The debounced search is `useCallback` + `useEffect`** — `load`'s identity *is* the query, the effect depends on that identity, and React runs the cleanup first, cancelling the pending timer.
> 2. **It only works because `notify` is stable** — `notify` is `useCallback(…, [dismiss])` over `dismiss` `useCallback(…, [])`; define `notify` inline and the app becomes an infinite fetch loop.
> 3. **Depend on primitives, never on an object rebuilt during render** — `selectedCount` and `selectedId` exist purely to keep the split-panel effect out of a re-render loop.
> 4. **Every request goes through `lib/services.ts`** — the single file that knows camelCase→snake_case, per-resource defaults, and odd response shapes.
> 5. **`apiError()` normalises FastAPI's two `detail` shapes** — a string from `HTTPException`, an array of `{loc,msg,type}` from Pydantic 422 — which is why the UI never shows `[object Object]`.
> 6. **Errors follow a three-way rule** — load failure → toast; mutation failure with a form → in-form `errorText`; mutation failure with no form → toast.
>
> **Read** §1–§7 (~22 min; §3 and §4 are the two that matter most). **Look up** everything
> under 🔎 Reference — never read it linearly.

> Companion to `05-frontend-overview.md`. Every snippet is copied from the repo and carries a
> `file:line`. Where I traced something and reached a conclusion that differs from the code
> comment, I say so.

---

## 1. The hooks, and why each one is there

Condensed on purpose: the reasoning, plus the two or three call sites that demonstrate it.
Exhaustive per-hook inventories are in R1.

### 1.1 `useState` — sibling primitives, not one object

The records page holds 20 separate `useState` calls
(`frontend/src/app/hosted-zones/[id]/records/page.tsx:118-147`):

```tsx
const [records, setRecords] = useState<DNSRecord[]>([]);
const [total, setTotal] = useState(0);
const [pages, setPages] = useState(1);
const [page, setPage] = useState(1);
const [search, setSearch] = useState("");
const [typeFilter, setTypeFilter] = useState("");
const [routingFilter, setRoutingFilter] = useState("");
const [aliasFilter, setAliasFilter] = useState("");
```
— `:119-127`

Not laziness — it is what makes the debounce in §3 work. Every one is a **primitive**, so
`useCallback` compares dependencies with `Object.is` on values, not references. Bundle them
into `const [query, setQuery] = useState({...})` and every keystroke produces a new object,
`loadRecords` gets a new identity on every render, and the memoisation collapses. A
`useReducer` over a single query object needs the same care.

**Functional updaters where the next value depends on the previous** — this is what lets
`setField`, `addBlock` and `removeBlock` avoid depending on `blocks` at all; they close over
nothing that can go stale:

```tsx
setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
```
— `frontend/src/app/hosted-zones/[id]/records/create/page.tsx:178` (also `:179-180`,
`hosted-zones/create/page.tsx:174`, `NotificationContext.tsx:26,32`, `records/page.tsx:307`)

### 1.2 `useEffect` — the six instructive ones

The app has 16 effects; these teach something. Full inventory in R1.1.

| Purpose | Site | Deps | Note |
|---|---|---|---|
| Restore session on mount | `context/AuthContext.tsx:23-42` | `[]` | `active` flag + cleanup (`:24,39-41`) so a fast unmount doesn't `setUser` after teardown |
| Auth guard redirect | `components/layout/AppShell.tsx:90-92` | `[loading, user, router]` | `!loading &&` is what stops the false redirect during restore |
| **Debounced list load** | `app/hosted-zones/page.tsx:163-166`, `records/page.tsx:233-236` | `[load, search]` | The centrepiece — §3 |
| Push theme to DOM + storage | `context/ThemeContext.tsx:33-39` | `[theme]` | Three writes that must never diverge, so one effect |
| Publish selection to the split panel | `app/hosted-zones/page.tsx:195-226`, `records/page.tsx:277-295` | primitives + stable setter | Carries an `eslint-disable` — §2.3 |
| Global `keydown` listener | `lib/useHotkey.ts:19-31` | `[key, alt, allowInInputs, enabled]` | Carries an `eslint-disable` — §2.2 |

**The cleanup pattern is worth naming**, because interviewers probe it:

```ts
useEffect(() => {
  let active = true;
  (async () => {
    ...
    const u = await authService.me();
    if (active) setUser(u);
    ...
    if (active) setLoading(false);
  })();
  return () => { active = false; };
}, []);
```
— `frontend/src/context/AuthContext.tsx:23-42`

`AbortController` would be better — it would actually cancel the HTTP request rather than
ignore its result — but the `active` flag correctly prevents the "setState on an unmounted
component" bug and, more importantly, prevents an out-of-order response overwriting a newer
one. Same flag at `hosted-zones/page.tsx:180,188-191`.

### 1.3 `useCallback` — only 12 sites, and each has a reason

It is not sprayed around; it appears where identity stability is *load-bearing*.

**(a) To tie an async loader's identity to its query inputs**, so an effect can depend on it:

```tsx
const load = useCallback(async () => {
  setLoading(true);
  try {
    const data = await zoneService.list({
      search, page, limit: pageSize,
      sortBy: sortingColumn.sortingField ?? "created_at",
      sortOrder: sortingDescending ? "desc" : "asc",
    });
    setZones(data.items);
    setTotal(data.total);
    setPages(data.pages);
    setSelectedItems([]);
  } catch (e) {
    notify({ type: "error", content: apiError(e, "Failed to load hosted zones") });
  } finally {
    setLoading(false);
  }
}, [search, page, pageSize, sortingColumn, sortingDescending, notify]);
```
— `frontend/src/app/hosted-zones/page.tsx:141-160`

`load`'s identity **is** the query. That's the trick the whole debounce rests on (§3). Six
more loaders have the same shape (R1.2).

**(b) To keep context functions permanently stable**, so consumers can safely put them in
dependency arrays:

```ts
const dismiss = useCallback((id: string) => {
  setFlashes((fs) => fs.filter((f) => f.id !== id));
}, []);

const notify = useCallback((f: Omit<Flash, "id">) => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  setFlashes((fs) => [...fs, { ...f, id }]);
  if (f.type === "success" || f.type === "info") {
    setTimeout(() => dismiss(id), 6000);
  }
}, [dismiss]);
```
— `frontend/src/context/NotificationContext.tsx:25-38`

`dismiss` has `[]` deps because the functional updater closes over nothing. `notify` depends
on `[dismiss]`, which is stable forever, so **`notify` is stable forever** — which is
precisely why `load` can list `notify` in its deps without destroying its own memoisation. The
most important two-hop dependency in the codebase. Other context functions follow the same
pattern (R1.2).

**Deliberately absent:** `ThemeContext.tsx:41` defines `const toggle = () => setTheme((t) => …)`
with no `useCallback`. Its one consumer (`TopNav.tsx:160`) calls it from an event handler,
never a dependency array. Memoising it would be cargo cult.

### 1.4 `useMemo` — six sites, and only two earn their keep

Full verdict table in R1.3. The one to talk about:

```tsx
const { records, warnings } = useMemo(
  () => (zoneName ? parseZoneFile(text, zoneName) : { records: [], warnings: [] }),
  [text, zoneName]
);
```
— `frontend/src/app/hosted-zones/[id]/import/page.tsx:210-213`

`parseZoneFile` is 99 lines (`:55-153`) of real RFC 1035 master-file parsing: quote-aware
comment stripping, folding parenthesised multi-line records into logical lines, `$ORIGIN` and
`$TTL` tracking, the "leading whitespace means reuse the previous owner name" rule, TTL and
class in either order, grouping values into record *sets* and taking the smallest TTL per set.
It runs against a `<textarea>` (`:336-348`) that users paste whole zone files into.

1. **Cost.** Without the memo, every keystroke re-parses the entire file — visible jank on a
   several-hundred-record zone.
2. **Reference stability** (the reason people forget). `records` feeds
   `useCollection(records, {...})` at `:232-251` and `blockingError`'s deps at `:228`. A fresh
   array every render would make Cloudscape's collection hook recompute its filtered/sorted/
   paginated view every render, and invalidate `blockingError` every render.

`blockingError` (`:216-228`) is memoised for that second reason — read at `:230` and `:270`,
deps `[text, records.length]` (a primitive, not the array). The third justified one is the
`errors` object at `test-record/page.tsx:108-143`: 35 lines of branching over 5 inputs, and an
object that must be reference-stable to be safe in deps.

### 1.5 `useRef` — two sites, one meaningful

**`DrawerContext.tsx:46` — `const dismissed = useRef(false)`.** Nothing renders from it, and
`setSplitOpen`/`setSplitData` are both `useCallback(…, [])`; as state it would have to enter
those dependency arrays and every consumer's `setSplitData` effect would re-fire whenever the
panel was dismissed. Full version in §7 and `05-frontend-overview.md` §5.2.

**`TopNav.tsx:163` — `const ref = useRef<HTMLElement>(null)`.** Attached to the `<header>` at
`:185` and **never read**. Dead — the remains of an intended click-outside detector; the
click-away is actually a full-screen backdrop div (`:187`). Worth deleting.

There is **no** `useRef` holding a timer: the debounce timer is a local `const t` inside the
effect (`hosted-zones/page.tsx:164`), which is the correct scope, since the effect's own
cleanup closes over it.

### 1.6 `useContext` — always behind a named hook

`useContext` is never called directly from a component. All five contexts export a consumer
hook and components import that (`useAuth`, `useNotify`, `useDrawer`, `useTheme`,
`useShortcuts` — definitions and example consumers in R1.4). Only `useDrawer` guards against
use outside its provider; `05-frontend-overview.md` §5.2 has what the other four do instead,
and why `null as unknown as T` is the codebase's one deliberate lie to TypeScript.

Consumers destructure exactly what they need — `const { setSplitData, splitPosition,
openInfoDrawer } = useDrawer();` (`records/page.tsx:274`). Worth knowing: **that destructuring
does not reduce re-renders.** A consumer re-renders whenever the provider's value object
changes, and `DrawerProvider` builds a fresh object literal every render
(`DrawerContext.tsx:64-74`). Destructuring only limits what you *read*.

### 1.7 Next.js navigation hooks

`useRouter`, `useParams`, `usePathname` and `useSearchParams` all come from `next/navigation`
— the App Router module; `next/router` is the Pages Router and is unused. Per-hook call sites
in R1.5. `router.push` is user navigation, `router.replace` is for redirects that shouldn't
enter history.

Cloudscape's `Link` and `BreadcrumbGroup` fire an `onFollow` event rather than navigating, so
every one is intercepted and handed to the router:

```tsx
<Link href={href} onFollow={(e) => { e.preventDefault(); router.push(href); }}>
  {zone.name}
</Link>
```
— `frontend/src/app/hosted-zones/page.tsx:84-90` (same at `AppShell.tsx:127-131`,
`ConsoleSideNav.tsx:110-114`)

That's why `next/link` never appears. The cost is no prefetching and no real `href` semantics
for middle-click / open-in-new-tab on those elements (`ConsoleSideNav.tsx:111` does let
`external` links through untouched).

---

## 2. Dependency arrays, properly

### 2.1 The rule this codebase follows

*Depend on primitives; keep functions stable with `useCallback`; never depend on an object you
recreate during render.* Three applications:

```tsx
const selectedCount = selectedItems.length;   // number
const selectedId = one?.id ?? null;           // number | null
```
— `frontend/src/app/hosted-zones/[id]/records/page.tsx:275-276` (same at
`hosted-zones/page.tsx:173,194`) — these two lines exist *only* to give the split-panel effect
primitive dependencies instead of the `selectedItems` array and the `one` object.

```tsx
}, [text, records.length]);
```
— `frontend/src/app/hosted-zones/[id]/import/page.tsx:228` — `records.length`, not `records`,
so re-parsing to an equal-length array doesn't invalidate.

```tsx
const pageSize = prefs.pageSize ?? 10;
```
— `frontend/src/app/hosted-zones/page.tsx:139` — `pageSize` (a number) goes into `load`'s deps
at `:160`, not the `prefs` object.

### 2.2 `eslint-disable` #1 — `useHotkey`, excluding `handler`

```ts
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, alt, allowInInputs, enabled]);
```
— `frontend/src/lib/useHotkey.ts:28-31`

**The excluded value is `handler`, and this is the clearest-cut of the three.** Every call site
passes an inline arrow:

```ts
useHotkey("?", () => setHelpOpen((o) => !o));
useHotkey("s", () => document.getElementById("global-search-input")?.focus(), { alt: true, allowInInputs: true });
useHotkey("/", () => document.getElementById("page-filter-input")?.focus());
```
— `frontend/src/context/ShortcutsContext.tsx:19-26`; also `hosted-zones/page.tsx:137` and
`records/page.tsx:149`.

So `handler` is a new reference every render. Include it and the effect tears down and
re-attaches a `window` `keydown` listener on every render of a provider that wraps the whole
app — i.e. on every render of anything. It doesn't infinite-loop (the effect sets no state)
but it is pure churn, turning three permanent listeners into an unbounded add/remove cycle.

**The cost, stated honestly: this is a stale-closure trap.** The listener captures the
`handler` from the *first* render forever. It happens to be safe in all five call sites:

| Call site | What the handler closes over | Safe because |
|---|---|---|
| `ShortcutsContext.tsx:19` | nothing — `setHelpOpen((o) => !o)` | functional updater |
| `ShortcutsContext.tsx:21,26` | nothing — `document.getElementById` | no closure at all |
| `hosted-zones/page.tsx:137` | `router` | `useRouter()` returns a stable object |
| `records/page.tsx:149` | `router`, `zoneId` | `zoneId` can't change without remounting the page |

The last one is safe **by accident**: `useHotkey("d", () => deleteSelected(selectedItems))`
would silently delete whatever was selected on first render. **The correct fix** is the
"latest ref" pattern — keep `handler` in a ref updated every render, read
`handlerRef.current()` inside the listener, and the dependency array becomes honest with no
suppression. It's the shape React's own `useEffectEvent` proposal formalises; naming it is a
strong answer.

```ts
const handlerRef = useRef(handler);
useEffect(() => { handlerRef.current = handler; });
// …inside onKeyDown: handlerRef.current();
```

### 2.3 `eslint-disable` #2 and #3 — the split-panel effects, excluding `one`

```tsx
const selectedCount = selectedItems.length;
useEffect(() => {
  setSplitData({
    count: selectedCount,
    noun: "hosted zone",
    detailTitle: "Hosted zone details",
    fields: one ? [ /* 7 label/value rows built from `one` and `ns` */ ] : undefined,
  });
  // `one` is derived from selectedId; excluded to avoid a re-render loop on its changing identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedCount, selectedId, ns, setSplitData]);
```
— `frontend/src/app/hosted-zones/page.tsx:194-226` (the twin is `records/page.tsx:277-295`,
deps `[selectedCount, selectedId, splitPosition, setSplitData]`)

`one` is computed inline during render:

```tsx
const one = selectedItems.length === 1 ? selectedItems[0] : null;
```
— `frontend/src/app/hosted-zones/page.tsx:168` (`records/page.tsx:268`)

**Why a derived object in a dependency array is dangerous here:** this effect *writes into a
context that its own component consumes*, so there is a closed loop:

```
  effect → setSplitData({…})               ← always a NEW object literal
        → DrawerProvider setSplitDataState → Object.is fails → re-render
        → DrawerContext value = new object   (DrawerContext.tsx:64-74)
        → every consumer re-renders, including THIS page
        → `one` is recomputed during render
        → if `one`'s identity changed, deps changed → effect runs again ↺
```

Any derived value with a **fresh reference each render** closes that loop into an infinite
one: `selectedItems.find(...)`, `zones.filter(...)`, `{ ...selected }`, `items.map(...)` — or
the whole `selectedItems` array if it were rebuilt during render. Depending on a number and a
`number | null` makes the loop structurally impossible.

**Where I differ from the comment, honestly.** I traced the current code and I do not believe
adding `one` would actually loop *today*: `one` is `selectedItems[0]`, a reference plucked out
of state rather than constructed, so re-rendering doesn't change its identity — only
`setSelectedItems` does, and that also changes `selectedCount`/`selectedId`. The disables are
**defensive, not strictly necessary at this moment**. The instinct is still right: primitives
are the dependency you can reason about, and the effect would become loop-prone the instant
`one` were derived with `.find()` instead of an index. Say exactly that — "it's a precaution
against a real failure mode, and I know why the precaution is cheap." The genuinely correct
fix: memoise `one` (`useMemo(() => selectedItems.length === 1 ? selectedItems[0] : null,
[selectedItems])`) and list it, making the guarantee explicit rather than incidental.

### 2.4 The `useCallback` + `useEffect([callback])` idiom

Four pages use this shape:

```tsx
const load = useCallback(async () => {
  try { setZone(await zoneService.get(zoneId)); }
  catch (e) { notify({ type: "error", content: apiError(e, "Failed to load hosted zone") }); }
}, [zoneId, notify]);

useEffect(() => { load(); }, [load]);
```
— `frontend/src/app/hosted-zones/[id]/edit/page.tsx:51-63` (also `import/page.tsx:195-205`,
`records/create/page.tsx:166-175`, `records/page.tsx:173-191,228-231`)

Read it as "run this when its inputs change." It satisfies `exhaustive-deps` with no
suppression and makes the trigger explicit — `zoneId` or `notify`, nothing else. It only works
because `notify` is stable (§1.3b); if `notify` were recreated per render this is an infinite
fetch loop: effect → `load()` → `setZone` → re-render → new `notify` → new `load` → effect → …

Two pages skip the idiom and inline the promise — equivalent, fewer moving parts, no cleanup:

```tsx
useEffect(() => {
  zoneService.get(zoneId).then(setZone)
    .catch((e) => notify({ type: "error", content: apiError(e, "Failed to load hosted zone") }));
}, [zoneId, notify]);
```
— `frontend/src/app/hosted-zones/[id]/test-record/page.tsx:98-103`
(`query-logging/page.tsx:55-60`)

---

## 3. The debounced search — the best hooks example in the codebase

```tsx
// debounce search
useEffect(() => {
  const t = setTimeout(load, search ? 300 : 0);
  return () => clearTimeout(t);
}, [load, search]);
```
— `frontend/src/app/hosted-zones/page.tsx:162-166` (identical at `records/page.tsx:233-236`,
with `loadRecords`)

Four lines. Here is the whole mechanism:

```
 user types "e"  ──► TextFilter.onChange (hosted-zones/page.tsx:332-335)
                      setPage(1); setSearch("e")
                            │
                            ▼
                      render: `load` is useCallback([search=…, page, pageSize,
                              sortingColumn, sortingDescending, notify])
                              → search changed → NEW `load` identity
                            │
                            ▼
                      effect deps [load, search] changed → React runs cleanup first
                              clearTimeout(previous 300ms timer)   ◄── the debounce
                            │
                            ▼
                      setTimeout(load, 300)

 user types "x"  ──► …same again, cancelling the "e" timer before it fires
 300ms of silence ─► the surviving timer fires → load() → one request
```

**Why `useCallback` is what makes it work.** The effect is triggered by `load`'s *identity*,
not by the search text. `load` is memoised on exactly the six values that change the request,
so:

- Typing changes `search` → new `load` → timer reset → debounced fetch. ✅
- Clicking page 2 changes `page` → new `load` → immediate-ish fetch. ✅
- Sorting changes `sortingColumn`/`sortingDescending` → new `load` → fetch. ✅
- A re-render caused by anything else (a toast appearing, the split panel opening) → same
  `load` → **effect does not re-run** → no fetch. ✅

That last line is the payoff. Without `useCallback`, `load` would be a new function on every
render, the effect would re-run on every render, and with a 0ms timer on an empty search box
it would be an unbounded fetch loop.

**Why `notify` in the deps doesn't break it.** `notify` is `useCallback(…, [dismiss])` and
`dismiss` is `useCallback(…, [])` (`NotificationContext.tsx:25-38`), so `notify` never changes
identity for the lifetime of the app. Include a non-memoised `notify` and the whole thing
collapses. **This is the question to be ready for**: *"what would happen if
`NotificationProvider` defined `notify` inline?"* Answer: `load` changes every render → effect
re-runs every render → with `search === ""` the timeout is 0ms → it fires → `setLoading(true)`
→ re-render → repeat. An infinite request loop, and the debounce for non-empty searches would
never survive a single render either.

**Why `search ? 300 : 0`.** Debouncing is only for typing. On mount, after clearing the
filter, or when only the page/sort changed *while the box is empty*, there is nothing to wait
for — fire immediately so the table doesn't sit blank for 300ms.

**Honest wrinkles:**

- `search` is in the deps array *and* is already baked into `load`'s identity — redundant as a
  trigger. It's there because the effect body reads it (`search ? 300 : 0`), which is what
  `exhaustive-deps` requires. Harmless.
- Changing page or sort **while a search is active** also waits 300ms, because the branch
  looks at `search`, not at *what* changed. Minor, but a real imprecision.
- There is no request cancellation. A slow request fired at t=0 can land after a fast one
  fired at t=400 and overwrite it with stale rows. The debounce makes this unlikely, not
  impossible. `AbortController` on the axios call (or, properly, TanStack Query) fixes it.
- The debounce is duplicated in two files. `useDebouncedEffect(load, search ? 300 : 0)` would
  be a five-line custom hook.

---

## 4. The four CRUD flows, end to end

### 4.1 READ — the hosted-zones list

```
1  User lands on /hosted-zones, or types in the filter box
       TextFilter onChange → setPage(1); setSearch(text)      hosted-zones/page.tsx:332-335
2  `search` changes → new `load` identity                      :141-160
3  debounce effect: clearTimeout(old); setTimeout(load, 300)   :163-166
4  load() → setLoading(true)                                   :142
5  zoneService.list({ search, page, limit: pageSize,
                      sortBy, sortOrder })                     :144-150
6  → api.get("/zones", { params: { search, type, page, limit,
                          sort_by, sort_order } })             lib/services.ts:41-53
       ▲ camelCase in, snake_case out — the ONLY place that translation happens
7  axios request interceptor adds Authorization: Bearer <r53_token cookie>
                                                               lib/api.ts:15-21
8  ← Paginated<HostedZone> { items, total, page, limit, pages } types/index.ts:58-64
9  setZones(items); setTotal(total); setPages(pages);
   setSelectedItems([])                                        :151-154
10 finally setLoading(false)                                   :157-159
11 Table renders items={zones} loading={loading};              :264,270
   Pagination currentPageIndex={page} pagesCount={pages}       :339-343
   Header counter shows (selected/total) or (total)            :293
   TextFilter countText shows "n matches"                      :331

   ✗ on failure: notify({ type:"error",
                    content: apiError(e, "Failed to load hosted zones") })  :156
```

Everything the user can do to the query goes through the same path, because all of them reset
`page` and invalidate `load`:

| Control | Handler | Line |
|---|---|---|
| Filter text | `setPage(1); setSearch(...)` | `:332-335` |
| Sort a column | `setSortingColumn(...); setSortingDescending(...); setPage(1)` | `:279-283` |
| Change page | `setPage(detail.currentPageIndex)` | `:342` |
| Change page size | `savePrefs(...)` → `setPrefs(next); setPage(1)` | `:127-135` |
| Refresh button | `load()` called directly | `:302` |

**Nothing is sorted, filtered or sliced in the browser.** The table receives exactly the rows
the API returned — which is why `Table` gets `items={zones}` and not a `useCollection(...)`
result. The one page that *does* use `useCollection` (`import/page.tsx:232-251`) is the
zone-file preview, whose rows come from a textarea and never touch the API.

### 4.2 CREATE — a hosted zone

```
1  /hosted-zones/create — user fills the form
       Domain name  Input onChange → setName + live revalidate  create/page.tsx:298-302
       Description  Textarea onChange → setDescription + live revalidate  :320-325
       Type         Tiles onChange → setType, clears VPC errors  :337-340
       VPC rows     AttributeEditor → setVpcRow(i, next)         :173-186
       Tags         TagEditor onChange → setTags, setTagsValid   :432-436
2  Click "Create hosted zone" → submit()                         :210
3  setFormError("")                                              :211
4  const found = validateAll(); setErrors(found)                 :212-213
       validateAll runs validateDomainName (:41-65) and
       validateDescription (:67-71), plus per-row VPC checks
       when type === "Private"                                   :188-208
5  hasFieldError? → return, no request is made                   :214-219
6  !tagsValid?  → setFormError("Resolve the errors in Tags…")
                  and return                                     :220-223
7  setSubmitting(true)                                           :225
8  zoneService.create({ name: name.trim(), type,
                        comment: description.trim() || null })   :228-232
       ▲ VPC associations and tags are presentation-only — the
         API accepts name/type/comment only (comment at :227)
9  → api.post("/zones", input)                                   lib/services.ts:58-61
10 ← HostedZone
11 notify({ type:"success",
            content: `Hosted zone ${zone.name} created successfully.` })  :233
12 router.push(`/hosted-zones/${zone.id}/records`)                :234
       ▲ straight into the new zone's records, so the success
         toast lands on the page you actually want

   ✗ on failure: setFormError(apiError(e, "Failed to create hosted zone"));
                 setSubmitting(false)                             :236-237
       ▲ IN-FORM error (Cloudscape Form errorText, :257), not a toast —
         the user is looking at the form, so the error belongs on it
```

**`setSubmitting(false)` is deliberately absent from the success path** (compare `:237`, where
it *is* called). The button stays in its loading state through the route transition instead of
flicking back to "enabled" for a frame before the page unmounts. Same asymmetry in
`edit/page.tsx:83-87` and `records/create/page.tsx:201-205`.

### 4.3 UPDATE — edit a record from the split panel

The most interesting flow, because it crosses a context boundary.

```
1  Records table, user selects exactly one row
       onSelectionChange → setSelectedItems([...detail.selectedItems])  records/page.tsx:374
2  selectedCount / selectedId change (:275-276)  →  split-panel effect  :277-295
       setSplitData({ count, noun:"record", detailTitle:"Record details",
                      detail: <RecordDetails record={one} columns={…}
                                onEdit={() => { setEditing(one); setFormOpen(true); }} /> })
       ▲ `detail` (a ReactNode) rather than `fields`, because the console
         puts an "Edit record" button above the key/value pairs and
         AppShell renders `fields` on its own (comment at :271-273)
3  DrawerContext.setSplitData stores it, and opens the panel if
   count > 0 && !dismissed.current                              context/DrawerContext.tsx:55-60
4  AppShell re-renders SplitPanelBody → count===1 && detail → renders it
                                                                 AppShell.tsx:53
5  User clicks "Edit record" inside the split panel              records/page.tsx:860
       → onEdit → setEditing(one); setFormOpen(true)             :286-289
6  <RecordForm zoneId zoneName record={editing} open={formOpen}
               onClose={…} onSaved={refreshAll} />               :713-720
7  RecordForm effect on [open, record, zone]                     RecordForm.tsx:66-85
       splits the FQDN back into subdomain + zone suffix (:69-71)
       seeds sub / type / value / ttl / routing (:72-75)
       clears submitError and submitted (:83-84)
8  User edits Value / TTL / Routing policy
       Record name and Record type are disabled when editing —
       Route 53 keys a record on name+type                       :162, :169-172
9  Click "Save changes" → submit()                               :96
       setSubmitError(""); setSubmitted(true)                    :97-98
       if (validateRecordName || validateRecordValue || validateTtl) return  :99
10 fullName = sub.trim() ? `${sub.trim()}.${zone}` : zone        :101
   payload = { name, type, value: value.trim(),
               ttl: Number(ttl), routing_policy: routing }       :102-108
11 recordService.update(zoneId, record.id, payload)              :112
12 → api.put(`/zones/${zoneId}/records/${recordId}`, input)      lib/services.ts:116-119
13 notify({ type:"success", content:`Record ${fullName} updated.` })  :113
14 onSaved() → refreshAll() → loadZone(); loadNameServers(); loadRecords()
                                                                 records/page.tsx:238-242
15 onClose() → setFormOpen(false)                                :119, :718

   ✗ on failure: setSubmitError(apiError(e, "Failed to save record"))  :121
       ▲ rendered by Cloudscape's <Form errorText={submitError}>       :148
         the modal STAYS OPEN so the user can fix and retry
```

**`refreshAll` is three sequential requests** (`:238-242`) for one edit: the zone (for the
header's record count), the NS records (for the details section), and the records page.
Editing a record's TTL cannot change either of the first two — only `loadRecords()` is needed.
The clearest "a cache library would have solved this" moment in the codebase: with TanStack
Query it'd be one `invalidateQueries` on the records key.

The same `RecordForm` is also the create path (`record === null` → `isEdit === false`, `:55`),
branching at `:111-117`. It is only ever opened for *editing* from this page — the Create
button routes to the dedicated multi-record page (`records/page.tsx:412-414`).

### 4.4 DELETE — bulk-delete records

```
1  User multi-selects rows (selectionType="multi")               records/page.tsx:372-374
2  Delete button enabled only if selection is non-empty AND
   contains no protected record                                  :401-404
       isProtected = type==="SOA" || (type==="NS" && name===zone.name)  :245
       disabledReason explains WHY it's greyed out               :402-404
3  Click Delete → setDeleteOpen(true)                            :405
4  <Modal open={deleteOpen} …> mounts NOW (returns null when
   closed — ui/Modal.tsx:33)                                     :723-749
       Body names the record when one is selected, or the count  :738-748
5  Confirm → doDelete()                                          :297
6  setDeleting(true)                                             :298
       (both footer buttons take disabled={deleting} — :729,:732)
7  recordService.bulkRemove(zoneId, selectedItems.map(r => r.id))  :300
8  → api.delete(`/zones/${zoneId}/records`,
                { params: { ids: ids.join(",") } })              lib/services.ts:123-125
       ▲ ONE request with comma-joined ids, not N requests
9  notify success; setDeleteOpen(false)                          :301-305
10 ── the page-step-back branch ──────────────────────────────
       if (records.length === selectedItems.length && page > 1)
            setPage((p) => p - 1);
       else refreshAll();                                        :306-308
11 finally setDeleting(false)                                    :311-313

   ✗ on failure: notify({ type:"error",
                   content: apiError(e, "Failed to delete records") })  :310
       ▲ TOAST, not an in-form error — a confirmation dialog has no form
         to attach one to. setDeleteOpen(false) is never reached, so the
         modal stays open for a retry.
```

**The step-back branch, explained** (`:306-308`) — this is the subtle bit:

> If you just deleted *every row currently on screen* and you are not on page 1, the page
> you're on no longer exists. Rather than refetch and then discover an empty table, the
> handler decrements `page`. That state change flows straight into the machinery from §3:
> `page` is in `loadRecords`'s dependency array (`:221`), so `loadRecords` gets a new
> identity, so the debounce effect (`:233-236`) re-runs and fetches page N-1 — with
> `search` empty that's a 0ms timeout, i.e. immediately.
>
> **The `else` is the whole point.** Calling `refreshAll()` *as well* would fire a request
> for the page you're leaving, which is guaranteed to come back empty and be immediately
> superseded — a wasted round trip and a visible flash of "No records."

Cost of the shortcut: the step-back branch reaches the refetch through `loadRecords` only, so
it **skips `loadZone()` and `loadNameServers()`** and the header's record count stays stale
until the next navigation (`refreshAll()` in the `else` branch does all three). Fixing it
properly means separating "which page am I on" from "refetch everything" — again the
cache-library answer.

The same branch exists on the zones page (`hosted-zones/page.tsx:238-239`) with two
differences: there is no bulk-delete endpoint for zones, so it fires N requests via
`Promise.all(selectedItems.map((z) => zoneService.remove(z.id)))` (`:231`) — and because the
table is `selectionType="single"` (`:274`), N is always 1. `Promise.all` also means one
failure rejects the whole thing while other deletes may already have succeeded, with no
partial-failure reporting. Unreachable with single-select, but worth naming before an
interviewer does.

---

## 5. The data layer

Every method on `authService` / `zoneService` / `recordService` is tabulated in R2. This
section is the *why*.

### 5.1 `lib/api.ts` — 44 lines, four responsibilities

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const TOKEN_COOKIE = "r53_token";

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // also send the httpOnly session cookie
});
```
— `frontend/src/lib/api.ts:4-12`

`NEXT_PUBLIC_` makes an env var readable in browser code — Next inlines it at build time, so
**changing the API URL requires a rebuild**, not just a restart. The value lives in
`frontend/.env.local`.

`withCredentials: true` is there because the backend *also* issues an httpOnly session cookie.
The app has two parallel auth mechanisms — a JS-readable bearer token and a browser-managed
cookie — and the comments at `:11` and `:14` say so plainly. The bearer token is the one the
frontend drives.

**The request interceptor:**

```ts
api.interceptors.request.use((config) => {
  const token = Cookies.get(TOKEN_COOKIE);
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```
— `frontend/src/lib/api.ts:15-21`

Why an interceptor rather than a header per call: it runs **per request, at request time**, so
it always reads the current cookie. Set the header once at `axios.create` time and it would
freeze the token that existed at module load — `undefined` on the login page, so the first
authenticated request after signing in would go out unauthenticated.

Note what is **not** here: no *response* interceptor. A 401 on an expired token does not clear
the cookie or redirect to `/login`; it surfaces as an error toast on whatever page you're on.
`AuthContext.tsx:33-34` clears the token, but only on the mount check. A real gap — the
standard fix is a response interceptor that catches 401, calls `clearToken()`, and redirects.

**Token helpers** (`:23-33`): `setToken` (1-day expiry, `sameSite: "lax"`), `clearToken`,
`hasToken`. `hasToken()` is what `AuthContext.tsx:26` uses to decide whether to bother calling
`/auth/me` on mount.

**`apiError()` — normalising FastAPI's two error shapes:**

```ts
export function apiError(err: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
    return err.message || fallback;
  }
  return fallback;
}
```
— `frontend/src/lib/api.ts:36-44`

FastAPI genuinely returns two different `detail` shapes, and this function is the reason the
UI never leaks `[object Object]`:

| Source | Body | Branch |
|---|---|---|
| `raise HTTPException(status_code=409, detail="Zone already exists")` | `{"detail": "Zone already exists"}` | `typeof detail === "string"` (`:39`) |
| Pydantic request validation (422) | `{"detail": [{"loc": [...], "msg": "field required", "type": "..."}]}` | `Array.isArray(detail) && detail[0]?.msg` (`:40`) |
| Network failure / CORS / timeout — no response at all | — | `err.message` (`:41`) |
| Anything that isn't an axios error | — | `fallback` (`:43`) |

It is called **26 times**, always as `apiError(e, "<contextual fallback>")`, so the fallback
doubles as documentation of what was being attempted: `"Failed to load hosted zones"`
(`hosted-zones/page.tsx:156`), `"Failed to import zone file"` (`import/page.tsx:286`),
`"Invalid email or password"` (`login/page.tsx:136`). Known limitation: for a 422 it returns
only `detail[0].msg` — the first error, with no field name, so a form with three invalid
fields shows one message and doesn't say which field.

### 5.2 Why a service layer instead of axios in components

| Reason | Where it shows up |
|---|---|
| **It is the only place that knows the wire format.** Components speak camelCase; nothing above this file has to know the API is Python | `sortBy` → `sort_by`, `sortOrder` → `sort_order`, `routingPolicy` → `routing_policy` at `services.ts:48-49,102-107` |
| **Defaults live in one place.** Zones default to newest-first, records to name-ascending — otherwise copy-pasted into every caller | `page: q.page \|\| 1`, `limit: q.limit \|\| 10`, `sort_by: q.sortBy \|\| "created_at"` (`:46-49`), records at `:106-107` |
| **Types are attached at the boundary**, so everything downstream is typed from `types/index.ts` with no casts and components never see `any` | `api.get<Paginated<HostedZone>>(...)` (`:42`) |
| **Response-shape knowledge is contained**, so callers get a clean value | `login` unwraps `data.access_token` (`:15`); `export` unwraps the `Content-Disposition` filename (`:75-77`) |
| **It's the seam.** Swapping axios for `fetch`, adding retries or cancellation, or mocking the whole API for tests is a change to one 137-line file | `import { api }` appears in exactly one place outside `api.ts` — `services.ts:1` — so the boundary is genuinely intact (`apiError` is imported broadly, but it's a pure function, not the client) |

What the layer deliberately does *not* do: no caching, deduplication, retry, cancellation or
optimistic updates. Every call is a fresh request. That is the trade-off of hand-rolling it,
and it's why `refreshAll` fires three requests for one record edit.

---

## 6. Conventions

### 6.1 Error handling — the three-way rule

| Situation | Treatment | Why | Examples |
|---|---|---|---|
| **Load failure** | Toast (`notify({type:"error"})`) | Nothing was in flight from the user's point of view; the page just has no data. There's no form to attach an error to | `hosted-zones/page.tsx:156`, `records/page.tsx:177,211`, `edit/page.tsx:57`, `import/page.tsx:199`, `test-record/page.tsx:102` |
| **Mutation success** | Toast (`notify({type:"success"})`) | Confirms the action, and survives the navigation that usually follows — the flashbar lives in `AppShell`, above the page | `create/page.tsx:233`, `RecordForm.tsx:113,116`, `records/page.tsx:302,327,339`, `import/page.tsx:277` |
| **Mutation failure — form present** | In-form error, modal/page stays put | The user is looking at the form and needs to fix and resubmit. A toast that auto-dismisses after 6s is the wrong affordance | `create/page.tsx:236` → `<Form errorText>` `:257`; `RecordForm.tsx:121` → `:148`; `records/create/page.tsx:203` → `:227` |
| **Mutation failure — no form** | Toast | A confirmation dialog has nowhere to render a field error | `records/page.tsx:310` (bulk delete), `:342` (delete zone), `hosted-zones/page.tsx:241` |

Two consistency notes, stated honestly:

- `edit/page.tsx:85` uses a **toast** on save failure even though it has a form with an
  `errorText` slot (`:117`). That's the one violation of the rule.
- Success toasts auto-dismiss after 6 seconds; error and warning toasts do not:
  `if (f.type === "success" || f.type === "info") setTimeout(() => dismiss(id), 6000)`
  (`NotificationContext.tsx:33-35`). Errors persist until dismissed, which is correct.

### 6.2 Toast identity

```ts
const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
```
— `frontend/src/context/NotificationContext.tsx:31`

Timestamp plus six random base-36 characters. Timestamp alone would collide when two
notifications fire in the same millisecond (which `Promise.all` deletes can do), and React
needs stable unique keys for the flashbar list. `crypto.randomUUID()` would be the modern
choice.

---

## 7. If they ask…

**"Why `useCallback` on `load`?"**
So that `load`'s function identity is a faithful proxy for the query. It's memoised on the six
values that change the request (`hosted-zones/page.tsx:160`), so the debounce effect can
depend on `[load, search]` and re-run *exactly* when the query changed — never on an
incidental re-render. Without it, `load` would be a new function every render, the effect
would re-run every render, and with an empty search box (0ms timer) that's an infinite fetch
loop.

**"How does your debounce work?"**
Two hooks. `load` is a `useCallback` memoised on the query inputs. An effect depends on
`[load, search]` and does `const t = setTimeout(load, search ? 300 : 0); return () =>
clearTimeout(t);` (`:163-166`). Each keystroke changes `search` → new `load` → the effect
re-runs → React fires the **cleanup first**, cancelling the pending timer → a new 300ms timer
is scheduled. Only 300ms of silence lets one survive. The `search ? 300 : 0` skips the delay
when there's nothing being typed — mount, cleared filter, page or sort change.

**"What makes that debounce fragile?"**
`notify` being in `load`'s dependency array. It's safe only because `notify` is
`useCallback(…, [dismiss])` and `dismiss` is `useCallback(…, [])`
(`NotificationContext.tsx:25-38`), so it's stable for the app's lifetime. If
`NotificationProvider` defined `notify` inline, `load` would change identity every render, the
effect would fire every render, and it would become an infinite request loop. It's a two-hop
dependency and it's invisible from the page's own code.

**"Why no React Query?"**
Nothing forced it, and hand-rolling made the data path explicit. But it's the one library I
would add, and I can point at the specific costs of not having it: `refreshAll` fires three
requests for a single record edit (`records/page.tsx:238-242`); every navigation back to
`/hosted-zones` refetches from zero with a spinner; there is no request cancellation, so a
slow request can land after a fast one and overwrite it; there are no optimistic updates; and
the debounce + `useCallback` machinery in §3 exists only because there's no cache. All five
are things TanStack Query solves by default.

**"How do you avoid stale closures?"**
Four ways, all present in the code. Functional state updaters where the next value depends on
the previous — `setBlocks((bs) => …)` (`records/create/page.tsx:178`), `setFlashes((fs) => …)`
(`NotificationContext.tsx:26`) — so the callback closes over nothing. Honest dependency arrays
plus `useCallback`, which is why the `useCallback`/`useEffect([callback])` idiom
(`edit/page.tsx:51-63`) needs no suppression. Depending on primitives instead of derived
objects (`selectedCount`, `selectedId` at `records/page.tsx:275-276`). And an `active` flag
with cleanup so a late response can't write to an unmounted component or clobber a newer one
(`AuthContext.tsx:23-42`, `hosted-zones/page.tsx:180-191`). The one place stale closures are a
live risk is `useHotkey`, which deliberately omits `handler` from its deps — see the next
question.

**"You have `eslint-disable react-hooks/exhaustive-deps` — justify them."**
Three of them. **`useHotkey.ts:30`** excludes `handler` because every call site passes an
inline arrow, so including it would tear down and re-attach a window `keydown` listener on
every render of a provider that wraps the whole app. It's the right trade today because all
five handlers close over nothing mutable, but it *is* a stale-closure trap and the proper fix
is a `handlerRef` updated each render — React's `useEffectEvent` pattern.
**`hosted-zones/page.tsx:225` and `records/page.tsx:294`** exclude the derived object `one`
from effects that write into `DrawerContext`, which this component consumes — a closed loop
where any dependency with a fresh identity per render would spin forever. Being honest: I
traced it, and because `one` is `selectedItems[0]` (a reference plucked from state, not
constructed) it wouldn't actually loop today; the disables are defensive. The clean fix is to
`useMemo` `one` and list it, making the guarantee explicit rather than incidental.

**"What's a hydration mismatch and how did you hit one?"**
Next renders the component tree on the server, ships that HTML, then React re-renders on the
client and expects the two to match. If they don't, React warns and discards the server HTML
for that subtree. I hit it on *every page*: `ShortcutsProvider` mounts the keyboard shortcuts
modal unconditionally (`ShortcutsContext.tsx:31`) and wraps the whole app; Cloudscape's
`Modal` mounts a portal placeholder into `document.body` even when `visible={false}`; that
node exists on the client and not in the server HTML. The fix was `if (!open) return null` in
the `Modal` adapter (`ui/Modal.tsx:29-33`), so both sides render nothing when closed.
Separately, `<html suppressHydrationWarning>` (`layout.tsx:25`) covers the *intentional*
mismatch from the pre-paint theme script, which adds `class="dark"` before React hydrates.

**"Why is `dismissed` a `useRef` and not `useState`?"**
Because nothing renders from it and, more importantly, because `setSplitOpen` and
`setSplitData` are both `useCallback(…, [])` (`DrawerContext.tsx:50,55`). As state it would
belong in those dependency arrays, both callbacks would get a new identity every time the user
closed the panel, and every consumer's `setSplitData` effect would re-fire. The ref keeps them
permanently stable. The behaviour it encodes: the details panel auto-opens the first time you
select a row so the feature is discoverable, and never reopens itself once you've closed it.

**"Walk me through what happens when I delete three records."**
Multi-select gives `selectedItems`; the Delete button is disabled if the selection contains
the SOA or apex-NS record, with a `disabledReason` explaining why
(`records/page.tsx:245,401-404`). Confirm opens a modal that mounts only at that moment.
`doDelete` (`:297`) calls `recordService.bulkRemove`, which is **one** request — `DELETE
/zones/:id/records?ids=1,2,3` (`services.ts:123-125`) — then toasts success and closes the
modal. Then the subtle branch: if I deleted every row on screen and I'm past page 1, it calls
`setPage(p => p - 1)` instead of refetching, because `page` is in `loadRecords`' dependency
array so decrementing it triggers the fetch automatically. Calling `refreshAll()` as well
would fire a doomed request for the page I'm leaving — hence the `else`. On failure it toasts
and leaves the modal open, because a confirmation dialog has no form to hang an error on.

**"Why is the API translation in the service layer?"**
So the wire format is a fact about exactly one file. `sortBy → sort_by`, `routingPolicy →
routing_policy` happen at `services.ts:48-49,102-107`; nothing above that line knows the
backend is Python. It's also where per-resource defaults live (zones sort newest-first,
records sort name-ascending, `:48-49` vs `:106-107`), where response types get attached
(`api.get<Paginated<HostedZone>>`), and where odd response shapes get unwrapped
(`data.access_token` at `:15`, the `Content-Disposition` filename at `:75-77`). The proof the
boundary holds: `import { api }` appears in exactly one file outside `api.ts`.

**"How does `apiError` handle FastAPI?"**
FastAPI returns two different `detail` shapes: a plain string from
`HTTPException(detail="…")`, and an array of `{loc, msg, type}` objects from Pydantic's 422
request validation. `apiError` (`api.ts:36-44`) checks `typeof detail === "string"` first,
then `Array.isArray(detail) && detail[0]?.msg`, then falls back to `err.message` for network
failures where there's no response at all, and finally to a caller-supplied string. It's
called 26 times, always with a contextual fallback like `"Failed to import zone file"`. Its
limitation is that for a 422 it shows only the first message with no field name.

**"You have four different form-validation patterns. Isn't that inconsistent?"**
Yes, and I'd unify it. But each one is defensible for its form: submit-gated and recomputed
every render works for four independent fields (`RecordForm.tsx:87-94`); stateful
validate-then-track is needed where the error shape is nested and different events clear
different parts of it (`create/page.tsx:171-208`); memoised-always/displayed-conditionally is
needed where the rules are cross-field, like the subnet mask whose maximum depends on whether
the EDNS0 IP is v4 or v6 (`test-record/page.tsx:108-146`); and per-row submit flags are needed
where the form is a repeatable list and a newly added row must stay silent
(`records/create/page.tsx:107,184,262`). The honest read is that the divergence is a symptom
of not having a form library to force one shape — which is the actual argument *for* React
Hook Form here.

**"What would you fix first in the CRUD layer?"**
Add a response interceptor for 401 — right now an expired token produces an error toast on
whatever page you're on instead of clearing the cookie and returning to `/login` (`api.ts` has
a request interceptor and no response one). Then TanStack Query, which removes the debounce
machinery, the `refreshAll` triple-fetch, and the missing request cancellation in one move.
Then extract the two duplicated blocks — the debounce effect and the localStorage prefs
restore — into `useDebouncedEffect` and `useStoredPrefs`. And extract `parseZoneFile`
(`import/page.tsx:55-153`) into `lib/` so it can be unit-tested; it and `dnsValidation.ts` are
~550 lines of branchy pure logic with zero test coverage today.

---

# 🔎 Reference — do not read this linearly

Everything below is lookup material: exhaustive inventories, per-site tables and full
snippets. Ctrl-F it when you need a specific fact; skip it on a read-through.

---

## R1. Per-hook inventories

### R1.1 Every `useEffect` in the app

| Purpose | Site | Deps | Note |
|---|---|---|---|
| Restore session on mount | `context/AuthContext.tsx:23-42` | `[]` | Uses an `active` flag + cleanup (`:24,39-41`) so a fast unmount doesn't `setUser` after teardown |
| Adopt pre-paint theme | `context/ThemeContext.tsx:22-25` | `[]` | Reads `localStorage`, which is browser-only |
| Apply Cloudscape token override | `context/ThemeContext.tsx:29-31` | `[]` | Guarded idempotent (`awsTheme.ts:36-42`) against StrictMode double-mount |
| Push theme to DOM + storage | `context/ThemeContext.tsx:33-39` | `[theme]` | Three writes that must never diverge, so one effect |
| Auth guard redirect | `components/layout/AppShell.tsx:90-92` | `[loading, user, router]` | `!loading &&` is what stops the false redirect during restore |
| Entry-route redirect | `app/page.tsx:12-15` | `[user, loading, router]` | Same guard, opposite direction |
| Bounce signed-in users off `/login` | `app/login/page.tsx:94-96` | `[loading, user, router]` | Mirror image; same at `signup/page.tsx:77-79` |
| Restore table preferences | `app/hosted-zones/page.tsx:118-125`, `records/page.tsx:152-159` | `[]` | Mount-only on purpose — see R4.1 |
| **Debounced list load** | `app/hosted-zones/page.tsx:163-166`, `records/page.tsx:233-236` | `[load, search]` | The centrepiece — §3 |
| Fetch name servers for the selected zone | `app/hosted-zones/page.tsx:175-192` | `[selectedId]` | `active` flag cancels a stale response |
| Publish selection to the split panel | `app/hosted-zones/page.tsx:195-226`, `records/page.tsx:277-295` | primitives + stable setter | Carries an `eslint-disable` — §2.3 |
| Load the zone on mount | `records/page.tsx:228-231`, `edit/page.tsx:61-63`, `import/page.tsx:203-205`, `records/create/page.tsx:173-175` | `[load…]` | The "wrap in `useCallback`, depend on the callback" idiom |
| Reset the form when the modal opens | `components/records/RecordForm.tsx:66-85` | `[open, record, zone]` | Guards with `if (!open) return` at `:67` |
| Global `keydown` listener | `lib/useHotkey.ts:19-31` | `[key, alt, allowInInputs, enabled]` | Carries an `eslint-disable` — §2.2 |
| Escape closes top-nav menus | `components/layout/TopNav.tsx:165-169` | `[]` | Not `useHotkey` — predates it / different target (`document`) |
| One-shot fetch of existing records | `records/create/page.tsx:430-436` | `[zoneId]` | Promise chain, no cleanup — a stale-response race if `zoneId` changed, which it can't in practice |

### R1.2 Every `useCallback` site

| Group | Sites |
|---|---|
| Async loaders memoised on their query (§1.3a) | `hosted-zones/page.tsx:141-160` (`load`), `records/page.tsx:193-226` (`loadRecords`, nine deps), `records/page.tsx:173-179` (`loadZone`), `:183-191` (`loadNameServers`), `edit/page.tsx:51-59`, `import/page.tsx:195-201`, `records/create/page.tsx:166-172` |
| Permanently stable context functions (§1.3b) | `NotificationContext.tsx:25-38` (`dismiss` `[]`, `notify` `[dismiss]`), `AuthContext.tsx:44,51,58` (`login`, `register`, `logout`, all `[]`), `DrawerContext.tsx:48,50,55` (`openInfoDrawer`, `setSplitOpen`, `setSplitData`, all `[]`), `ShortcutsContext.tsx:16` (`openHelp`, `[]`) |
| Deliberately *not* memoised | `ThemeContext.tsx:41` (`toggle`) — one consumer, `TopNav.tsx:160`, called from an event handler |

### R1.3 Every `useMemo` site

| Site | What it memoises | Verdict |
|---|---|---|
| `import/page.tsx:210-213` | `parseZoneFile(text, zoneName)` | **The best-justified `useMemo` in the codebase** |
| `import/page.tsx:216-228` | `blockingError` | Justified — depends on `records.length` from the parse above |
| `test-record/page.tsx:108-143` | The whole `errors` object | Justified — 35 lines of branching over 5 inputs, and being an object it must be reference-stable to be safe in deps |
| `hosted-zones/page.tsx:247-255` | `visibleContentOptions` | Marginal — `[]` deps over a module constant; could be hoisted out of the component |
| `records/page.tsx:346-354` | Same | Same |
| `hosted-zones/create/page.tsx:135` | `vpcsForRegion(row.region)` | Marginal — cheap hash function, but keeps the `options` array reference stable for `Select` |

### R1.4 The five context consumer hooks

| Hook | Definition | Example consumer |
|---|---|---|
| `useAuth` | `context/AuthContext.tsx:75` | `AppShell.tsx:73` |
| `useNotify` | `context/NotificationContext.tsx:47` | `hosted-zones/page.tsx:98` |
| `useDrawer` | `context/DrawerContext.tsx:81-85` | `records/page.tsx:274` |
| `useTheme` | `context/ThemeContext.tsx:46` | `TopNav.tsx:160` |
| `useShortcuts` | `context/ShortcutsContext.tsx:12` | `TopNav.tsx:161` |

### R1.5 Next.js navigation hooks, per site

| Hook | Sites | What for |
|---|---|---|
| `useRouter` | 12 files | `router.push` for user navigation; `router.replace` for redirects that shouldn't enter history (`AppShell.tsx:91`, `app/page.tsx:14`, `login/page.tsx:95,121`, `signup/page.tsx:78,92`, `TopNav.tsx:182`) |
| `useParams` | 6 files | Reading `[id]` — `records/page.tsx:113`, `records/create/page.tsx:153`, `edit/page.tsx:38`, `import/page.tsx:182`, `test-record/page.tsx:83`, `query-logging/page.tsx:46` |
| `usePathname` | 1 file | `ConsoleSideNav.tsx:102` — deciding which nav link is active |
| `useSearchParams` | 3 files | `ConsoleSideNav.tsx:103`; `resolver/page.tsx:55` and `traffic-policies/page.tsx:19` (both behind `<Suspense>`) |

---

## R2. `lib/services.ts` — every method

**`authService`** (`:12-28`)

| Method | Signature | Call |
|---|---|---|
| `login` | `(email: string, password: string) => Promise<string>` | `POST /auth/login` → returns `data.access_token` |
| `register` | `(email, password, full_name) => Promise<string>` | `POST /auth/register` → `data.access_token` |
| `logout` | `() => Promise<void>` | `POST /auth/logout` |
| `me` | `() => Promise<User>` | `GET /auth/me` |

`login` and `register` return the raw token string, not the response body — the caller
(`AuthContext.tsx:45-48`) does `setToken(token)` then `authService.me()` to get the user. Two
round trips; the API could return both.

**`zoneService`** (`:40-81`), with `ZoneQuery` at `:31-38`

| Method | Signature | Call |
|---|---|---|
| `list` | `(q: ZoneQuery = {}) => Promise<Paginated<HostedZone>>` | `GET /zones` + 6 query params |
| `get` | `(id: number) => Promise<HostedZone>` | `GET /zones/:id` |
| `create` | `(input: ZoneCreateInput) => Promise<HostedZone>` | `POST /zones` |
| `update` | `(id, input: Partial<ZoneCreateInput>) => Promise<HostedZone>` | `PUT /zones/:id` |
| `remove` | `(id: number) => Promise<void>` | `DELETE /zones/:id` |
| `export` | `(id, format: "json" \| "bind") => Promise<{data: string; filename: string}>` | `GET /zones/:id/export` |

`export` (`:69-80`) is the only method with real logic: it flips axios's `responseType` and
suppresses the default JSON transform for BIND output (`transformResponse: [(d) => d]`, `:73`)
so the raw text isn't mangled, then parses the filename out of the `Content-Disposition`
header with a regex (`:75-77`) and falls back to `zone.json` / `zone.txt`. The caller turns
that into a Blob download (`records/page.tsx:316-334`).

**`recordService`** (`:96-130`), with `RecordQuery` at `:84-94`

| Method | Signature | Call |
|---|---|---|
| `list` | `(zoneId, q: RecordQuery = {}) => Promise<Paginated<DNSRecord>>` | `GET /zones/:zoneId/records` + 8 query params |
| `create` | `(zoneId, input: RecordInput) => Promise<DNSRecord>` | `POST /zones/:zoneId/records` |
| `update` | `(zoneId, recordId, input: Partial<RecordInput>) => Promise<DNSRecord>` | `PUT /zones/:zoneId/records/:recordId` |
| `remove` | `(zoneId, recordId) => Promise<void>` | `DELETE /zones/:zoneId/records/:recordId` |
| `bulkRemove` | `(zoneId, ids: number[]) => Promise<void>` | `DELETE /zones/:zoneId/records?ids=1,2,3` |
| `importZone` | `(zoneId, zoneFile: string) => Promise<ImportResult>` | `POST /zones/:zoneId/records/import` |

`recordService.remove` (`:120-122`) is **never called** — every delete path goes through
`bulkRemove`, even for a single record. Dead but harmless; it's the natural REST counterpart
and costs three lines.

---

## R3. Form validation — the four patterns in full

No form library and no schema validator. Validation is plain functions, mostly in
`frontend/src/lib/dnsValidation.ts` (447 lines transcribed from the Route 53 developer guide —
the doc pages it follows are cited at `:1-6`). Four display strategies evolved; knowing which
is which, and when each is right, is the strongest thing to say about this area.

### R3.1 Pattern 1 — submit-gated, recomputed every render

```tsx
// Recomputed every render so an error clears the moment the field becomes valid.
const errors = submitted
  ? {
      name: validateRecordName(sub, zone, type) ?? undefined,
      value: validateRecordValue(type, value) ?? undefined,
      ttl: validateTtl(ttl) ?? undefined,
    }
  : {};
```
— `frontend/src/components/records/RecordForm.tsx:87-94`

A single boolean `submitted` (`:63`, set at `:98`) gates *all* display: silent before the
first submit, then errors recompute on every keystroke and vanish the instant the field is
fixed.

**Why it's right here:** four fields, three cheap validators, no error state to keep in sync.
`errors` is derived, not state, so it can never go stale.

**When it's wrong:** if the validators were expensive (they aren't) or if `errors` were fed
into a dependency array (it isn't — it's read directly in JSX at `:155,185,200`). Being a
fresh object every render, it would invalidate any memo it touched.

Note `submit()` re-runs the same validators rather than reading `errors` (`:99`) — necessary,
because `setSubmitted(true)` on the line above doesn't take effect until the next render.

### R3.2 Pattern 2 — stateful, validate-then-track

```tsx
// Errors appear on submit, then track the field live so they clear as soon as it is fixed.
const revalidate = (patch: Errors) => setErrors((prev) => ({ ...prev, ...patch }));
```
— `frontend/src/app/hosted-zones/create/page.tsx:171`

```tsx
<Input
  value={name}
  onChange={({ detail }) => {
    setName(detail.value);
    if (errors.name) revalidate({ name: validateDomainName(detail.value) });
  }}
/>
```
— `:295-302` (same shape for description at `:320-325`)

Errors are **state** (`:166`). `submit()` populates them wholesale via `validateAll()`
(`:188-208`, `setErrors` at `:213`); after that each field's `onChange` re-validates **only
itself, and only if it already has an error** — the `if (errors.name)` guard is what makes it
"silent until submit, live afterwards," per field.

**Why it's right here:** the error shape is genuinely complex — a nested
`Record<number, {region?, vpcId?}>` for the VPC rows (`:149-154`) — and different events clear
different parts of it. Switching zone type wipes only the VPC errors (`:339`), removing a VPC
row does the same (`:414`). Recomputing everything every render would fight those targeted
clears.

**When it's wrong:** any time the derived version would do. State mirroring a pure function of
other state is a synchronisation bug waiting to happen — miss a `revalidate` call in one
`onChange` and that field's error goes stale. `edit/page.tsx:45,168,174-177` is the minimal
version of this pattern (one field, one `useState<string | undefined>`), and there Pattern 1
would have been simpler.

### R3.3 Pattern 3 — memoised, always computed, displayed conditionally

```tsx
const errors = useMemo(() => {
  const name = recordName.trim();
  ...
  const out: { recordName?: string; resolverIp?: string; ednsIp?: string; subnetMask?: string } = {};
  if (name) { ... }
  if (resolver && !isIp(resolver)) { ... }
  if (mask) {
    if (!edns) out.subnetMask = "Specify an EDNS0 client subnet IP before you specify a subnet mask.";
    else if (!/^\d{1,3}$/.test(mask)) { ... }
    else {
      const max = IPV4.test(edns) ? 32 : 128;
      if (Number(mask) > max) out.subnetMask = `Specify a value between 0 and ${max}.`;
    }
  }
  return out;
}, [recordName, resolverIp, ednsIp, subnetMask, zoneName]);

const hasErrors = Object.keys(errors).length > 0;
const shown = submitted ? errors : {};
```
— `frontend/src/app/hosted-zones/[id]/test-record/page.tsx:108-146`

**Computation and display are separated.** `errors` is always current; `shown` is the
submit-gated view of it (`:146`); `hasErrors` gates the request (`:150`). JSX reads
`shown.recordName` etc. (`:220,262,283,302`).

**Why it's right here:** the rules are *cross-field* — the subnet-mask rule depends on the
EDNS0 IP being present, and its maximum (32 vs 128) depends on whether that IP is v4 or v6.
You cannot validate one field in isolation, so per-field `onChange` validation (Pattern 2)
would be wrong by construction. And because the result is an object read in three places
(`hasErrors`, `shown`, JSX), memoising keeps its reference stable.

`import/page.tsx:216-230` is the same pattern with a single value: `blockingError` is a
memoised computation (`:216-228`), `zoneFileError = submitted ? blockingError : undefined` is
the gated view (`:230`), and `doImport` checks the ungated one (`:270`).

### R3.4 Pattern 4 — per-row submit flags

```ts
type Block = {
  key: number;
  sub: string;
  type: RecordType;
  ...
  /** Errors stay hidden until this block has been through a submit attempt. */
  submitted: boolean;
};
```
— `frontend/src/app/hosted-zones/[id]/records/create/page.tsx:94-107`

```tsx
const submit = async () => {
  setSubmitError("");
  setBlocks((bs) => bs.map((b) => ({ ...b, submitted: true })));
  if (blocks.some((b) => Object.keys(validateBlock(b, zoneNoDot)).length > 0)) return;
  ...
```
— `:182-185`

```tsx
{blocks.map((b, i) => {
  const errors = b.submitted ? validateBlock(b, zoneNoDot) : {};
```
— `:261-262`

The `submitted` flag lives **on each row**, not on the form. A newly added block gets
`submitted: false` (`:112-124`), so a fresh row is silent even though the form has already
been submitted once.

`validateBlock` (`:128-144`) also **branches on the row's own alias toggle**: an alias row
validates `endpoint` and `region` and returns early (`:133-137`); a non-alias row validates
`value` and `ttl` instead (`:139-143`). Different rows in the same form genuinely have
different required fields.

**Why it's right here:** a repeatable section where each row is independently valid or invalid
and rows come and go at runtime. A single form-level `submitted` flag would light up errors on
a row the user hasn't touched yet. **When it's wrong:** for a fixed set of fields it's
over-engineering — Pattern 1 with one boolean does the job.

Note `submit` calls `setBlocks(...)` then immediately reads the **old** `blocks` at `:185`.
That works because `validateBlock` doesn't look at `submitted`, only at field values, which
the pending state update doesn't change. Correct, but fragile — it relies on a detail of
`validateBlock`.

### R3.5 The validators themselves

`lib/dnsValidation.ts` exports three entry points used by all four forms:

| Function | Lines | What it does |
|---|---|---|
| `validateRecordName(sub, zoneName, type)` | `:410-438` | Wildcard placement, empty labels, 63-char labels, 255-char total, and the DNS rule that a CNAME can't sit at the apex (`:416`) |
| `validateRecordValue(type, value)` | `:394-407` | Splits on newlines, validates each line by record type, prefixes `Line N:` when multi-valued (`:404`), and enforces "a CNAME can have only one value" (`:400`) |
| `validateTtl(ttl)` | `:440-447` | Whole number in `[0, 2147483647]` — the API's documented range (`:10-11`) |

Under those sits `validateLine` (`:276-388`), a 112-line switch over 18 record types with real
rdata rules — MX priority range, SRV's four tokens, NAPTR's six with quoting rules, CAA
flags/tag/quoted-value, DS/TLSA/SSHFP hex digests, RFC 9460 SvcParams for HTTPS/SVCB — plus a
hand-written IPv6 parser that correctly handles `::` compression and embedded IPv4
(`:129-161`), and a quote-aware tokenizer for TXT/SPF (`:190-227`).

**Why not Zod?** Zod is excellent at *shape* validation and this is almost entirely *format*
validation of one string field whose rules depend on a sibling field (`type`). You'd end up
with `z.string().superRefine(...)` wrapping the same `validateLine` switch — a dependency and
a layer without removing the hard part. Where a schema library *would* have paid off: the
create-zone form's nested VPC error shape (`create/page.tsx:149-154`), and generating
TypeScript types from the backend's OpenAPI schema instead of hand-writing `types/index.ts`.

**Why no React Hook Form?** Four forms, each with a different display strategy, none with more
than a handful of fields. RHF's wins — uncontrolled inputs, fewer re-renders, `register`
boilerplate reduction — don't apply cleanly to Cloudscape's controlled
`value`/`onChange({detail})` components. The real cost of not having it is the four divergent
patterns above; a library would have forced one.

---

## R4. Notable patterns

### R4.1 localStorage table preferences

```tsx
const PREFS_STORAGE_KEY = "r53-hosted-zones-prefs";

const DEFAULT_PREFS: Prefs = {
  pageSize: 10,
  wrapLines: false,
  visibleContent: ALL_COLUMN_IDS,
  custom: "automatic",
};

// Restore saved table preferences (page size, visible columns, …) like the real console does.
useEffect(() => {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
  } catch {
    /* ignore malformed saved preferences */
  }
}, []);

const savePrefs = (next: Prefs) => {
  setPrefs(next);
  setPage(1);
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage may be unavailable — preferences just won't persist */
  }
};
```
— `frontend/src/app/hosted-zones/page.tsx:31-40,117-135` (identical shape at
`records/page.tsx:43,105-110,151-169`, key `r53-records-prefs`)

| Decision | Why |
|---|---|
| `{ ...DEFAULT_PREFS, ...JSON.parse(raw) }` — defaults spread *first* | A blob saved before a new preference existed still produces a complete object; the new key falls through to its default. Read the stored value alone and `prefs.wrapLines` is `undefined` for every existing user after a release. Forward-compatible persistence in one line |
| `useState(DEFAULT_PREFS)` then restore in a mount-only effect | Not `useState(() => JSON.parse(localStorage...))`: a lazy initialiser runs during render, including the server render, where `localStorage` doesn't exist. It would crash SSR — and if it didn't, server and client would render different HTML, a hydration mismatch. The effect runs only in the browser, after hydration |
| Both `try/catch` blocks | `JSON.parse` throws on a corrupted blob; `setItem` throws in Safari private mode and on quota exceeded. Neither should break the page, so both degrade to "defaults" / "won't persist" |
| `setPage(1)` in `savePrefs` | Changing page size invalidates the current page index — page 5 of 10-per-page is a non-existent page at 100-per-page |
| Separate keys per table | `r53-hosted-zones-prefs` vs `r53-records-prefs`, because the two tables have different columns (6 vs 10) and different sensible page sizes |

Weakness: the restore effect and `savePrefs` are duplicated verbatim across two files.
`useStoredPrefs(key, defaults)` would be a ten-line hook. Also, preferences are per-browser
and per-device, not per-account — the real console stores them server-side.

### R4.2 `Modal` returns `null` when closed

Covered in `05-frontend-overview.md` §7. `frontend/src/components/ui/Modal.tsx:29-33`. The
one-liner: Cloudscape's Modal mounts a portal placeholder even while hidden, that node is
absent from the server HTML, and `ShortcutsProvider` mounts the shortcuts modal on every page
— so the mismatch was universal until closed dialogs stopped rendering anything.

### R4.3 Server-side pagination, wired to a Cloudscape table

The contract is `Paginated<T>` (`frontend/src/types/index.ts:58-64`):

```ts
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
```

Three of those five fields drive three separate pieces of UI:

```
     API response                   React state              Cloudscape prop
  ┌────────────────┐            ┌───────────────┐        ┌──────────────────────────┐
  │ items          │ ─────────► │ zones         │ ─────► │ <Table items=…>          │  :264
  │ total          │ ─────────► │ total         │ ─────► │ <Header counter=…>       │  :293
  │                │            │               │   └──► │ <TextFilter countText=…> │  :331
  │ pages          │ ─────────► │ pages         │ ─────► │ <Pagination pagesCount=…>│  :341
  │ page (ignored) │            │ page (local)  │ ─────► │ <Pagination currentPage…>│  :340
  └────────────────┘            └───────────────┘        └──────────────────────────┘
                                       ▲
                                       └── every filter/sort/pageSize handler
                                           calls setPage(1)      :279-283, :332-335, :129
```
— line numbers from `frontend/src/app/hosted-zones/page.tsx`

| Point | Detail |
|---|---|
| `page` is **local state that the request reads**, not something read back from the response | The API echoes `page` at `types/index.ts:61` and the app ignores it |
| `pagesCount` comes from the server | The pager knows how many pages exist without ever having seen them |
| **`setPage(1)` on every query change is mandatory** | Filtering while on page 5 would otherwise request page 5 of a two-page result and render an empty table. Sorting (`:281`), filtering (`:333`), page size (`:129`) and each of the four record filters (`records/page.tsx:449,459,469`, plus the token `clear` callbacks at `:248-258`) all reset it |
| `setSelectedItems([])` inside `load` (`:154`, `records/page.tsx:209`) | Clears the selection on every fetch, so you can't act on a row that has scrolled off the page you're now looking at |
| The sort state is two pieces — a `TableProps.SortingColumn` object and a boolean (`:110-113`) | That's Cloudscape's `onSortingChange` shape; the service converts: `sortBy: sortingColumn.sortingField ?? "created_at"`, `sortOrder: sortingDescending ? "desc" : "asc"` (`:148-149`) |
| The **contrast case**: `import/page.tsx:232-251`, the only client-side table | `useCollection(records, { filtering, pagination: { pageSize: 10 }, sorting })`, then `{...collectionProps}`, `{...filterProps}`, `{...paginationProps}` spread onto the components (`:389,407,417`). Client-side because the rows come from a `<textarea>` and there is no endpoint to page against |
