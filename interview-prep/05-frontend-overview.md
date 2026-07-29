# 05 — Frontend Overview

> Source of truth: everything under `frontend/src` plus `frontend/package.json`.
> Every claim below carries a `file:line`. Nothing here is inferred from memory.

---

## 1. The 30-second version

> "It's a Next.js 15 App Router frontend — 44 TypeScript/TSX files under `src` plus one
> stylesheet — that reskins itself as the real AWS Route 53 console. The UI is built on
> **Cloudscape**, AWS's own open-source design system, so the tables, split panels, flashbars
> and form fields are the same components the real console uses. Almost every file is a
> **client component**, because the app is a single-page-feel console behind a token auth
> guard. There is **no Redux, no React Query, no form library and no Zod** — state is five
> React contexts, data fetching is a hand-written `axios` service layer, and validation is
> plain functions transcribed from the Route 53 developer guide. Sorting, filtering and
> pagination are all **server-side**; the service layer is the only place that knows the API
> speaks `snake_case`."

Numbers to have ready:

| Thing | Count | Where |
|---|---|---|
| Source files under `frontend/src` | 44 `.ts`/`.tsx` + `globals.css` | — |
| Routes (page.tsx files) | 16 | `src/app/**/page.tsx` |
| React contexts | 5 | `src/context/` |
| Custom hooks | 6 (1 real + 5 context consumers) | `src/lib/useHotkey.ts`, `src/context/*` |
| Service objects | 3 (`authService`, `zoneService`, `recordService`) | `frontend/src/lib/services.ts` |
| Runtime dependencies | 9 | `frontend/package.json:11-21` |

---

## 2. Next.js App Router, as actually used here

### 2.1 File-based routing

The App Router maps directories to URLs and requires the file to be named `page.tsx`.
`frontend/src/app/hosted-zones/[id]/records/create/page.tsx` is literally
`/hosted-zones/:id/records/create`. There is exactly one `layout.tsx`
(`frontend/src/app/layout.tsx`) at the root — no nested layouts. The shared chrome is
**not** a layout; it's a component (`AppShell`) each page renders itself. See §4 for why
that matters.

### 2.2 `"use client"` — why nearly everything is a client component

Line 1 of essentially every page and component is `"use client"` — e.g.
`frontend/src/app/hosted-zones/page.tsx:1`, `frontend/src/app/providers.tsx:1`,
`frontend/src/components/layout/AppShell.tsx:1`.

The three files that are **not** client components:

| File | Why it can stay a server component |
|---|---|
| `frontend/src/app/layout.tsx` | Exports `metadata` (`:6-9`), which is only legal in a server component, and renders `<Providers>` as a child |
| `frontend/src/lib/services.ts` | Plain module, no hooks, no DOM — imported by client code |
| `frontend/src/types/index.ts` | Types + one const array |

The honest reason the rest are client components: **the entire data path is authenticated
with a token read from a browser cookie**. `frontend/src/lib/api.ts:15-21` attaches
`Authorization: Bearer …` from `Cookies.get(TOKEN_COOKIE)` in an axios request
interceptor — that's `document.cookie`, which only exists in the browser. On top of that,
every screen holds interactive state (selection, filters, split panel, modals) and every
Cloudscape component is itself a client component. Server components would buy nothing
here because there is no server-rendered data to stream.

**The trade-off to admit:** this app gets almost no benefit from RSC. A version that
fetched hosted zones in a server component with an httpOnly cookie would ship less JS and
render the first table without a loading spinner. The backend *does* set an httpOnly
session cookie (`frontend/src/lib/api.ts:11-12` sends `withCredentials: true` precisely so
that cookie travels), so that refactor is available — it just wasn't done.

### 2.3 Dynamic segments

`[id]` is the only dynamic segment, and it's read with `useParams()`, not via page props:

```tsx
const params = useParams();
const zoneId = Number(params.id);
```
— `frontend/src/app/hosted-zones/[id]/records/page.tsx:113-115` (same three lines in
`edit/page.tsx:38-40`, `import/page.tsx:183-184`, `test-record/page.tsx:84-85`,
`query-logging/page.tsx:47-48`, `records/create/page.tsx:154-155`).

Why `useParams()` and not the server-component `params` prop? Because the component is
already `"use client"`, and in Next 15 the `params` prop is a Promise that a client
component would have to `use()`. `useParams()` is the client-side equivalent and returns
the value synchronously. The cost: `params.id` is typed `string | string[]`, so every call
site does `Number(params.id)` with no validation — a URL like `/hosted-zones/abc/records`
produces `NaN` and a failed request, surfaced only as an error toast.

> **Gap worth naming:** there is no `frontend/src/app/hosted-zones/[id]/page.tsx`. The URL
> `/hosted-zones/5` 404s; the zone "detail" page is `/hosted-zones/5/records`. Every link
> in the app points at `…/records` (e.g. `frontend/src/app/hosted-zones/page.tsx:81`), so
> it never shows in normal use.

### 2.4 `useSearchParams` and the `<Suspense>` boundary

Two pages read the query string, and both wrap the reader in `<Suspense>`:

```tsx
export default function ResolverPage() {
  return (
    <Suspense fallback={null}>
      <ResolverContent />
    </Suspense>
  );
}
```
— `frontend/src/app/resolver/page.tsx:63-69` (identical shape at
`frontend/src/app/traffic-policies/page.tsx:27-33`; the actual `useSearchParams()` call is
at `resolver/page.tsx:55` and `traffic-policies/page.tsx:19`).

**Why this is required:** `useSearchParams()` depends on information Next.js does not know
at build time. When Next prerenders a route, any component calling it must be able to bail
out to client rendering, and Next expresses that as "must be inside a Suspense boundary."
Without one, `next build` fails the route with *"useSearchParams() should be wrapped in a
suspense boundary."* The boundary scopes the client-only part so the rest of the page can
still be prerendered.

Why these two pages need it at all: the side nav routes eight mocked sections through one
page and distinguishes them by `?section=` — see the `href`s in
`frontend/src/components/layout/ConsoleSideNav.tsx:46-51` and the lookup table at
`frontend/src/app/resolver/page.tsx:7-52`.

> **Inconsistency to be honest about:** `ConsoleSideNav` also calls `useSearchParams()`
> (`frontend/src/components/layout/ConsoleSideNav.tsx:103`) and is **not** itself wrapped
> in a Suspense boundary — it's rendered deep inside `AppShell`
> (`frontend/src/components/layout/AppShell.tsx:121`). If asked, say: the boundary was
> added where the build demanded it, and the nav's call is inside a subtree that is already
> client-rendered end to end. I did not run `next build` to confirm the nav is exempt.

---

## 3. Route inventory

| URL | File | What it is |
|---|---|---|
| `/` | `frontend/src/app/page.tsx` | Entry redirect — `/hosted-zones` if signed in, else `/login` (`:12-15`) |
| `/login` | `frontend/src/app/login/page.tsx` | Pixel-faithful AWS sign-in: user-type step → credentials step, root **and** IAM flows, demo-credentials button (`:178-185`) |
| `/signup` | `frontend/src/app/signup/page.tsx` | AWS "Sign up for AWS" card → `register()` (`:81-97`) |
| `/dashboard` | `frontend/src/app/dashboard/page.tsx` | `<ComingSoon>` placeholder (6 lines) |
| `/hosted-zones` | `frontend/src/app/hosted-zones/page.tsx` | **Main list.** Server-side search/sort/paginate, single-select, split panel, delete modal |
| `/hosted-zones/create` | `frontend/src/app/hosted-zones/create/page.tsx` | Create zone: domain-name validation, Public/Private tiles, mock VPC rows, tag editor |
| `/hosted-zones/:id/records` | `frontend/src/app/hosted-zones/[id]/records/page.tsx` | **Biggest page (918 lines).** Records table, 4 filters, multi-select, bulk delete, export, edit-in-split-panel, 4 tabs |
| `/hosted-zones/:id/records/create` | `frontend/src/app/hosted-zones/[id]/records/create/page.tsx` | "Quick create record" — N repeatable record blocks, alias toggle, per-block validation |
| `/hosted-zones/:id/edit` | `frontend/src/app/hosted-zones/[id]/edit/page.tsx` | Edit zone description (everything else is immutable, `:148-157`) |
| `/hosted-zones/:id/import` | `frontend/src/app/hosted-zones/[id]/import/page.tsx` | BIND zone-file import with a **client-side RFC 1035 parser** and live preview table |
| `/hosted-zones/:id/test-record` | `frontend/src/app/hosted-zones/[id]/test-record/page.tsx` | Simulated DNS query — resolves NOERROR/NXDOMAIN/NODATA locally (`:148-174`) |
| `/hosted-zones/:id/query-logging` | `frontend/src/app/hosted-zones/[id]/query-logging/page.tsx` | Faithful console form that honestly refuses (needs CloudWatch, `:28-29`) |
| `/health-checks` | `frontend/src/app/health-checks/page.tsx` | `<ComingSoon>` |
| `/profiles` | `frontend/src/app/profiles/page.tsx` | `<ComingSoon>` |
| `/resolver?section=…` | `frontend/src/app/resolver/page.tsx` | 11 mocked Resolver sections behind one route |
| `/traffic-policies?section=…` | `frontend/src/app/traffic-policies/page.tsx` | 2 mocked Traffic-flow sections |

Real CRUD lives in exactly 6 of these 16 routes. The other 10 are chrome, auth, or honest
placeholders — a deliberate choice: `ComingSoon`
(`frontend/src/components/layout/ComingSoon.tsx:15-43`) keeps the full console shell and
says the feature isn't built, rather than offering a dead button.

---

## 4. The shared `AppShell`

`frontend/src/components/layout/AppShell.tsx` (200 lines) is the single most important
component in the app. Every authenticated page renders it as its root element.

### 4.1 What it provides

| Slot | Line | Content |
|---|---|---|
| Top navigation | `:110-112` | `<TopNav>` in its own stacking context, `zIndex: 1002` |
| Main layout | `:115-192` | Cloudscape `AppLayoutToolbar` |
| Page content | `:119` | `content={children}` |
| Notifications | `:120` | `<Flashbar>` — reads `NotificationContext` |
| Side navigation | `:121-123` | `<ConsoleSideNav>` + open/close state |
| Breadcrumbs | `:124-133` | Built from the `breadcrumbs: Crumb[]` prop, intercepted with `router.push` |
| Right-side drawers | `:136-165` | Two: `info` (help panel) and `troubleshooting` (bug icon) |
| Split panel | `:168-182` | Details panel fed from `DrawerContext.splitData` |
| Footer | `:195-197` | `<ConsoleFooter>` |

The split panel body is rendered by a local helper, `SplitPanelBody`
(`:43-59`): one selected item with `fields` renders Cloudscape `KeyValuePairs`
(reflowing to 3 columns when the panel is docked at the bottom, `:46`); one selected item
with a custom `detail` node renders that; anything else renders "Select a … to see its
details."

### 4.2 It doubles as the auth guard

```tsx
const { user, loading } = useAuth();
const router = useRouter();
...
useEffect(() => {
  if (!loading && !user) router.replace("/login");
}, [loading, user, router]);

if (loading || !user) {
  return <div className="min-h-screen" style={{ backgroundColor: "var(--rz-layout)" }} />;
}
```
— `frontend/src/components/layout/AppShell.tsx:73-96`

Three things to point out about this:

1. **`!loading &&`** is what stops the redirect firing during session restore.
   `AuthContext` starts with `loading: true` (`frontend/src/context/AuthContext.tsx:20`),
   so without that check every hard refresh would bounce an authenticated user to
   `/login` before `authService.me()` came back.
2. **The blank canvas at `:94-96`.** The early return happens *before* any child renders,
   so protected content never flashes on screen while the redirect is in flight. It uses
   the theme's own layout colour (`var(--rz-layout)`) so it doesn't flash white in dark
   mode either.
3. **`router.replace`, not `push`** — the protected URL doesn't end up in history, so the
   browser back button from `/login` doesn't bounce off the guard.

**Weakness to own:** this is a *client-side* guard. It hides UI, it doesn't protect data —
the API is what actually enforces auth. If the backend were open, viewing source would be
enough. The fix would be Next middleware reading the httpOnly cookie and redirecting
before the page ships.

**Why `AppShell` is a component instead of a `layout.tsx`:** the auth pages
(`/login`, `/signup`) must *not* have the shell, and `/` must render nothing at all. With
a root layout you'd need route groups to opt them out; here each page opts in by
rendering `<AppShell>`. The price is a `breadcrumbs={[...]}` array duplicated in 12 files,
and — because a component remounts on navigation while a layout would persist — the side
nav's open/closed state (`:75`) and split-panel width (`:77`) reset on every page change.
The width comment at `:177-178` claims the chosen width "sticks while navigating"; it
doesn't, because `useState` lives in `AppShell` and `AppShell` unmounts. Split panel
*open/position* do survive, because those live in `DrawerContext` above the router.

---

## 5. The five contexts

Nesting order — `frontend/src/app/providers.tsx:12-20`:

```
ThemeProvider
└── AuthProvider
    └── NotificationProvider
        └── DrawerProvider
            └── ShortcutsProvider
                └── {children}   ← the whole app
```

`Providers` is mounted once, in `frontend/src/app/layout.tsx:30`.

| Context | File | State it holds | Functions exposed | Consumed by |
|---|---|---|---|---|
| **Theme** | `context/ThemeContext.tsx` | `theme: "light" \| "dark"` (`:19`) | `toggle()` (`:41`) | `TopNav.tsx:160` |
| **Auth** | `context/AuthContext.tsx` | `user: User \| null`, `loading: boolean` (`:19-20`) | `login`, `register`, `logout` (`:44-66`) | `AppShell:73`, `page.tsx:9`, `login:81`, `signup:67`, `TopNav:159` |
| **Notification** | `context/NotificationContext.tsx` | `flashes: Flash[]` (`:23`) | `notify(f)`, `dismiss(id)` (`:25-38`) | `Flashbar.tsx:12` + **every** page that fetches or mutates |
| **Drawer** | `context/DrawerContext.tsx` | `splitOpen`, `splitPosition`, `splitData`, `activeDrawerId` (`:41-44`) | `setSplitOpen`, `setSplitPosition`, `setSplitData`, `setActiveDrawerId`, `openInfoDrawer` (`:48-60`) | `AppShell:80-88`, `hosted-zones/page.tsx:171`, `records/page.tsx:274` |
| **Shortcuts** | `context/ShortcutsContext.tsx` | `helpOpen` (`:15`) | `openHelp()` (`:16`) | `TopNav.tsx:161` |

### 5.1 Why the nesting order matters

It is not arbitrary. Read it as a dependency chain — an inner provider may consume an
outer one, never the reverse:

- **Theme is outermost** because it must apply before any Cloudscape component paints.
  `frontend/src/context/ThemeContext.tsx:37` calls `applyMode(...)`, which flips
  Cloudscape's own global mode; running it late would repaint the whole tree.
- **Auth is above Notification** and `Drawer`/`Shortcuts` sit under it, because those
  three are only meaningful inside `AppShell`, which is gated on auth.
- **Notification is above Drawer** so that anything inside can call `notify`. In practice
  `Drawer` doesn't consume it, but the pages that consume both do.
- **Shortcuts is innermost** and is the only provider that renders UI of its own:
  `<KeyboardShortcutsModal>` at `frontend/src/context/ShortcutsContext.tsx:31`. Being
  innermost keeps that modal above everything else in the tree. This is also the file that
  forced the `Modal` hydration fix — see §7.

### 5.2 Two deliberate differences between the contexts

**Only `useDrawer` throws outside its provider.**

```ts
export function useDrawer() {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error("useDrawer must be used within DrawerProvider");
  return ctx;
}
```
— `frontend/src/context/DrawerContext.tsx:81-85`

Compare the other four, which are all one-liners:
`useAuth` (`AuthContext.tsx:75`), `useNotify` (`NotificationContext.tsx:47`),
`useTheme` (`ThemeContext.tsx:46`), `useShortcuts` (`ShortcutsContext.tsx:12`).

The reason is the *default value* each context was created with:

| Context | Default | Consequence outside the provider |
|---|---|---|
| `DrawerContext` | `null` (`:38`) | Guard throws a named error — the good pattern |
| `AuthContext` | `null as unknown as AuthCtx` (`:16`) | **Lies to TypeScript.** `useAuth().user` outside a provider is a `TypeError: Cannot read properties of null` at runtime with no useful message |
| `NotificationContext` | `null as unknown as NotificationCtx` (`:20`) | Same |
| `ThemeContext` | Real object `{ theme: "light", toggle: () => {} }` (`:14`) | Silently no-ops — safe but debuggable-hostile |
| `ShortcutsContext` | Real object `{ openHelp: () => {} }` (`:11`) | Same |

If asked "what would you change first?": make all five follow the `useDrawer` pattern.
The `null as unknown as T` cast is the one place the codebase deliberately defeats the
type system, and it trades a clear error message for saving four lines.

**`useRef` instead of `useState` for the dismissed flag.**

```ts
// Once the user closes the panel themselves, stop reopening it on the next selection.
const dismissed = useRef(false);

const setSplitOpen = useCallback((open: boolean) => {
  if (!open) dismissed.current = true;
  setSplitOpenState(open);
}, []);

const setSplitData = useCallback((d: SplitData) => {
  setSplitDataState(d);
  if (d.count > 0 && !dismissed.current) setSplitOpenState(true);
}, []);
```
— `frontend/src/context/DrawerContext.tsx:46-60`

The behaviour: selecting a table row auto-opens the details panel the *first* time, so the
feature is discoverable; once the user closes it, selecting more rows never reopens it.

`dismissed` is a **ref, not state, because nothing renders from it**. Changing it must not
trigger a re-render — and critically, both `setSplitOpen` and `setSplitData` are
`useCallback(..., [])`. If `dismissed` were state, it would have to appear in those
dependency arrays, both callbacks would get a new identity on every dismiss, and every
consumer's `setSplitData` effect (see `06-frontend-crud.md` §2) would re-fire. A ref keeps
the callbacks permanently stable. That stability is load-bearing.

### 5.3 Context instead of Redux — the argument

**What Context is doing here:** five small, mostly-independent slices with no cross-slice
derivation, no time-travel need, and a total of about a dozen state fields.

**What it costs:** every consumer of a context re-renders whenever *any* field in that
context's value changes, because the provider passes a fresh object literal —
e.g. `frontend/src/context/DrawerContext.tsx:64-74` constructs a new value object every
render. In this app that's cheap: `DrawerContext` has two consumers, `ThemeContext` has
one, `ShortcutsContext` has one. The one context consumed everywhere is `Notification` —
and `notify`/`dismiss` are `useCallback`-stabilised (`:25-38`) precisely so consumers can
depend on them safely.

**When this stops scaling — the answer to give:**

1. When a context is consumed by dozens of components *and* its value changes often. The
   fix before Redux is splitting one context into a stable-actions context and a
   volatile-state context, or wrapping the value in `useMemo`.
2. When server data needs caching, deduplication, background refetch, or optimistic
   updates. That's not a Redux problem — that's React Query, and it's the single biggest
   thing this frontend is missing. Right now every navigation to `/hosted-zones` refetches
   from zero with a spinner, and `records/page.tsx:238-242` (`refreshAll`) fires three
   sequential requests after every mutation.
3. When state must be derived across slices, or debugged as a transaction log.

None of those are true today, which is why Context was the right call — and the honest
follow-up is: *"If I added one library, it would be TanStack Query, not Redux."*

---

## 6. Component inventory

### `components/layout/` — the console chrome

| File | Lines | What it does |
|---|---|---|
| `AppShell.tsx` | 200 | The shell + auth guard. See §4 |
| `TopNav.tsx` | 499 | The black AWS bar: logo, Amazon Q, services grid, cosmetic global search (`:224-235`), CloudShell, notifications bell, Help menu, Settings menu (contains the **theme switch**, `:314-330`), Regions menu, account menu with **Sign out** (`:486-491`). All icons are hand-written inline SVG (`:25-103`) |
| `ConsoleSideNav.tsx` | 117 | Cloudscape `SideNavigation`. `resolveActiveHref` (`:92-98`) keeps "Hosted zones" highlighted on detail routes and disambiguates the `?section=` pages |
| `ConsoleFooter.tsx` | 34 | 26px dark footer strip. The only file in `components/` with no `"use client"` — it has no hooks |
| `Drawers.tsx` | 143 | `HelpContent` (Info drawer body, with a "Was this helpful?" toggle at `:33`) and `ToolsContent` (Operational troubleshooting, two tabs that honestly say CloudWatch isn't implemented) |
| `ComingSoon.tsx` | 43 | The placeholder screen, wrapped in a full `AppShell` so only the main panel is empty |

### `components/ui/` — small shared primitives

| File | Lines | What it does |
|---|---|---|
| `Modal.tsx` | 46 | Adapter over Cloudscape `Modal` that renames the props to `open`/`onClose`/`title` **and returns `null` when closed** — see §7 |
| `Flashbar.tsx` | 28 | Renders `NotificationContext.flashes` into Cloudscape's `Flashbar`; returns `null` when empty (`:13`) |
| `Button.tsx` | 41 | Hand-rolled Tailwind pill button (primary/normal/link) used **only inside modal footers**, e.g. `hosted-zones/page.tsx:427-432`. Everywhere else uses Cloudscape's `Button` |
| `TagEditor.tsx` | 76 | Controlled wrapper over Cloudscape `TagEditor` with the full Route 53 i18n string set and a 50-tag cap (`:12`). `onChange` hands back `(tags, valid)` so the parent form can block submit |
| `KeyboardShortcutsModal.tsx` | 37 | Five-row reference table, always mounted by `ShortcutsProvider` |

### `components/records/`

| File | Lines | What it does |
|---|---|---|
| `RecordForm.tsx` | 232 | The **edit-a-record** modal. Uses Cloudscape's `Modal` directly, not `ui/Modal`. Disables Record name and Record type when editing (`:162`, `:172`) because Route 53 keys a record on name+type |

### `components/brand/`

| File | Lines | What it does |
|---|---|---|
| `AwsLogo.tsx` | 51 | Inline SVG recreation of the "aws" wordmark + orange smile, used on `/login` and `/signup`. No external image dependency |

### `lib/` — non-component logic

| File | Lines | What it does |
|---|---|---|
| `api.ts` | 44 | axios instance, request interceptor, token cookie helpers, `apiError()` |
| `services.ts` | 137 | `authService`, `zoneService`, `recordService` — the whole API surface |
| `dnsValidation.ts` | 447 | Per-record-type rdata validation transcribed from the Route 53 developer guide (`:1-6` cites the exact AWS doc pages). Includes a hand-written IPv6 parser (`:129-161`) and a quote-aware tokenizer (`:190-227`) |
| `routingPolicies.ts` | 51 | Typed routing-policy list with `supported: boolean` and a "why not" description |
| `useHotkey.ts` | 32 | The only hook with real logic — see §8 |
| `awsTheme.ts` | 43 | Repaints Cloudscape's primary button AWS orange via the supported `applyTheme` token API, guarded by a module-level `applied` flag (`:36-42`) so React 18 StrictMode double-mounts are idempotent |
| `auth.ts` | 17 | **Dead** — see §10 |

---

## 7. `Modal.tsx` returns `null` when closed — the hydration fix

```tsx
// Cloudscape's Modal mounts a Portal even while hidden, and the placeholder it injects
// is absent from the server HTML — which produced a hydration mismatch on every page,
// since the shortcuts modal is always mounted by ShortcutsProvider. Rendering nothing
// until the dialog is actually opened avoids that and keeps closed dialogs out of the DOM.
if (!open) return null;
```
— `frontend/src/components/ui/Modal.tsx:29-33`

The chain, told as a story:

1. `ShortcutsProvider` renders `<KeyboardShortcutsModal open={helpOpen} …>`
   **unconditionally** — `frontend/src/context/ShortcutsContext.tsx:31`.
2. `ShortcutsProvider` wraps the whole app (`providers.tsx:16`), so that modal is mounted
   on **every** page.
3. Cloudscape's `Modal` mounts a React portal even when `visible={false}`, and the
   placeholder node it injects into `document.body` is a client-only artefact.
4. Next.js server-renders the tree, ships that HTML, then hydrates. The server HTML has no
   placeholder; the client's first render does. React compares them and reports a
   hydration mismatch — **on every page**.
5. Returning `null` before touching Cloudscape means server and client agree: nothing.

`frontend/src/app/layout.tsx:25` also carries `suppressHydrationWarning` on `<html>` —
that one is for the inline theme script (§9), which mutates `documentElement.classList`
before React hydrates, and is a separate, expected mismatch.

Side benefit worth mentioning: closed dialogs are now genuinely absent from the DOM, so
`document.querySelector` in tests, and screen readers, don't see phantom dialogs.

---

## 8. Keyboard shortcuts

### The hook

```ts
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useHotkey(
  key: string,
  handler: () => void,
  opts: { alt?: boolean; allowInInputs?: boolean; enabled?: boolean } = {}
) {
  const { alt = false, allowInInputs = false, enabled = true } = opts;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (e.altKey !== alt) return;
      if (!allowInInputs && isTypingTarget(e.target)) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, alt, allowInInputs, enabled]);
}
```
— `frontend/src/lib/useHotkey.ts:5-32` (complete file, minus imports)

Four design points:

1. **The typing-target guard** (`:24`) is why pressing `c` inside the filter box types a
   `c` instead of navigating to Create. Without it every single-letter shortcut would make
   text inputs unusable. `isContentEditable` is checked too, so rich-text areas are safe.
2. **`allowInInputs`** is the escape hatch — Alt+S focuses the global search *from* the
   global search box, so it opts in (`ShortcutsContext.tsx:21-24`).
3. **`e.altKey !== alt`** means a shortcut registered without `alt` will *not* fire when
   Alt is held. That's what stops `Alt+S` from also triggering a bare `s` handler.
4. **`enabled`** short-circuits before `addEventListener` (`:20`), and because it's in the
   dependency array (`:31`) the listener is properly attached/detached when it flips.
   Nothing in the codebase currently passes `enabled` — it's unused API surface.

### The three global shortcuts, and the DOM-id targeting

```ts
useHotkey("?", () => setHelpOpen((o) => !o));
useHotkey("s", () => document.getElementById("global-search-input")?.focus(), {
  alt: true,
  allowInInputs: true,
});
useHotkey("/", () => document.getElementById("page-filter-input")?.focus());
```
— `frontend/src/context/ShortcutsContext.tsx:19-26`

Plus one page-scoped shortcut registered twice:
`useHotkey("c", () => router.push("/hosted-zones/create"))`
(`frontend/src/app/hosted-zones/page.tsx:137`) and
`useHotkey("c", () => router.push(\`/hosted-zones/${zoneId}/records/create\`))`
(`frontend/src/app/hosted-zones/[id]/records/page.tsx:149`). Only one is mounted at a time
because only one page is mounted, so `c` means "create the thing this page lists."

**Why focus is targeted by DOM id, not a ref.** The handlers live in
`ShortcutsProvider`, which sits *above* the router
(`frontend/src/app/providers.tsx:16`). The elements they focus live *below* it and change
with the route:

- `global-search-input` is set on the top-nav input,
  `frontend/src/components/layout/TopNav.tsx:225`.
- `page-filter-input` is set via Cloudscape's `controlId` prop on whatever `TextFilter`
  the current page renders —
  `frontend/src/app/hosted-zones/page.tsx:327` and
  `frontend/src/app/hosted-zones/[id]/records/page.tsx:432`.

To use refs instead you would need a sixth context whose only job is to let each page
register `{ filterInputRef }` on mount and clear it on unmount — a ref-registry context.
That's real machinery for one `getElementById`. The id approach is a deliberate trade:
it's the one place the app reaches around React to touch the DOM directly, it's untypeable,
and a duplicate id would silently focus the wrong element. `?.focus()` means it fails
silently on pages without a filter box, which is the desired behaviour.

The shortcuts are documented to the user in
`frontend/src/components/ui/KeyboardShortcutsModal.tsx:5-11`. Note the modal advertises
`Esc` — that isn't `useHotkey`; Cloudscape's `Modal` handles it, and `TopNav` has its own
`Escape` listener for its dropdown menus (`TopNav.tsx:165-169`).

---

## 9. Theming and dark mode

Three coordinated pieces. Being able to name all three is the whole answer.

### Piece 1 — the inline pre-paint script (solves FOUC)

```js
(function () {
  try {
    var t = localStorage.getItem('r53-theme');
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
```
— `frontend/src/app/layout.tsx:12-19`, injected at `:27` via
`<script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />` inside `<head>`.

**The problem it solves.** The server has no idea what theme the user picked — the choice
lives in `localStorage`, which is browser-only. So the server always renders light HTML.
React can't fix it either: `ThemeContext` initialises to `"light"`
(`ThemeContext.tsx:19`) and only reads storage in a `useEffect`
(`:22-25`), and effects run *after* paint. Result: a dark-mode user sees a white flash on
every page load — the classic flash of unstyled/wrong content.

**Why a raw inline script works.** It's synchronous and in `<head>`, so it executes before
the browser paints the body. By the time the first pixel appears, `<html>` already has
`class="dark"` and the CSS variables under `.dark` are in force.

**Why the `try/catch`.** `localStorage` throws in Safari private mode and when cookies are
blocked. A throw in a `<head>` script blocks the rest of the page, so the failure mode has
to be "stay light," never "blank page."

**Why `suppressHydrationWarning` on `<html>`** (`layout.tsx:25`): the script mutates
`documentElement.classList` before React hydrates, so the server HTML (`<html lang="en">`)
and the client DOM (`<html lang="en" class="dark">`) differ on purpose. This attribute is
scoped to that one element, not a blanket suppression.

### Piece 2 — `ThemeContext` keeps React and the DOM in sync

Three effects, deliberately separate — `frontend/src/context/ThemeContext.tsx:22-39`:

```ts
// 1. adopt whatever the pre-paint script already decided
useEffect(() => {
  const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "light";
  setTheme(stored);
}, []);

// 2. one-time Cloudscape token override (mode-independent)
useEffect(() => { applyAwsConsoleTheme(); }, []);

// 3. push every subsequent change out to the DOM, Cloudscape, and storage
useEffect(() => {
  document.documentElement.classList.toggle("dark", theme === "dark");
  applyMode(theme === "dark" ? Mode.Dark : Mode.Light);
  localStorage.setItem(STORAGE_KEY, theme);
}, [theme]);
```

Effect 1 is mount-only (`[]`) — it *adopts* the DOM state the script created rather than
fighting it. Effect 3 depends on `[theme]` and does all three writes together, which is
why it's a single effect and not three: they must never diverge.

`applyMode` (`:37`) is the non-obvious line. **Cloudscape components read their own root
class, not ours** — the comment at `:35-36` says exactly that. Toggling `.dark` themes the
hand-written Tailwind parts; `applyMode` themes every Cloudscape table, modal and form
field. Miss it and dark mode is half-applied.

The storage key is exported (`STORAGE_KEY = "r53-theme"`, `:16`) — but the inline script
hard-codes the same literal (`layout.tsx:14`) because it can't import anything. That's a
real duplication: renaming the key in one place silently breaks the no-flash behaviour.

### Piece 3 — CSS custom properties flipped under `.dark`

`frontend/src/app/globals.css` defines ~28 variables on `:root` (`:7-41`) and redefines
the same names under `.dark` (`:44-78`). Two families:

- Generic Cloudscape-ish tokens: `--layout`, `--surface`, `--fg`, `--link`, `--error`, …
- The Route 53 console palette, prefixed `--rz-`: `--rz-ink`, `--rz-link`, `--rz-surface`,
  `--rz-layout`, `--rz-selected`, … (`:28-40` light, `:65-77` dark).

`@theme inline` (`:81-102`) republishes the generic set as Tailwind colour utilities, so
`bg-surface` and `text-muted` are theme-aware for free. The `--rz-*` set is consumed
directly in inline styles — e.g. `AppShell.tsx:95` (`var(--rz-layout)`),
`Button.tsx:22-29`, `Drawers.tsx:9-13`, `KeyboardShortcutsModal.tsx:23`.

`@custom-variant dark (&:where(.dark, .dark *))` at `:4` is the Tailwind v4 declaration
that binds the `dark:` variant to the `.dark` class rather than the OS media query — which
is what makes the manual toggle authoritative over the system preference.

`html.dark { color-scheme: dark; }` (`:108-110`) is a small but real detail: it's what
turns native scrollbars, form controls and the `<select>` dropdown dark.

### Where the user actually flips it

Not a standalone toggle — it's inside the top nav's **Settings → Visual mode** radio group,
matching the real console: `frontend/src/components/layout/TopNav.tsx:309-332`, calling
`setVisual` (`:174-176`) which calls `toggle()` only when the mode differs. "Browser
default" is rendered but is never checked (`:316`) and maps to light — the app doesn't
read `prefers-color-scheme` at all. Honest gap.

---

## 10. Every package in `package.json`

### Runtime dependencies (`frontend/package.json:11-21`)

| Package | Version | What it's actually used for |
|---|---|---|
| `@cloudscape-design/components` | `^3.0.1334` | The UI. Table, AppLayoutToolbar, SplitPanel, Flashbar, Form/FormField, Select, Modal, Pagination, TextFilter, CollectionPreferences, AttributeEditor, TagEditor, FileUpload, Tabs, KeyValuePairs, CopyToClipboard… Imported per-component (`import Table from "@cloudscape-design/components/table"`) for tree-shaking |
| `@cloudscape-design/global-styles` | `^1.0.63` | Two jobs: the base stylesheet (`layout.tsx:2`) and `applyMode`/`Mode` for Cloudscape's dark mode (`ThemeContext.tsx:4,37`) |
| `@cloudscape-design/collection-hooks` | `^1.0.103` | **One call site only:** `useCollection` in `import/page.tsx:5,232-251`, for *client-side* filter/sort/paginate of the zone-file preview. It's the only table whose data isn't server-paginated, because the rows come from a textarea, not the API |
| `next` | `^15.1.7` | Framework. Only `next/navigation` is imported anywhere — `useRouter`, `useParams`, `usePathname`, `useSearchParams`. Notably **`next/link` and `next/image` are never used** |
| `react` | `^19.0.0` | — |
| `react-dom` | `^19.0.0` | Never imported by name in `src`; required by React/Next to render to the DOM |
| `axios` | `^1.6.8` | The only HTTP client. Instance + interceptor + `isAxiosError` in `lib/api.ts:1,8,37` |
| `js-cookie` | `^3.0.5` | Read/write the `r53_token` cookie (`lib/api.ts:2`). Also imported by the dead `lib/auth.ts:1` |
| `lucide-react` | `^0.475.0` | **Never imported.** Zero occurrences in `frontend/src` |

### Dev dependencies (`frontend/package.json:22-33`)

| Package | Used for |
|---|---|
| `typescript`, `@types/node`, `@types/react`, `@types/react-dom` | TS toolchain and types |
| `@types/js-cookie` | Types for `js-cookie` v3, which ships none |
| `tailwindcss` `^4.0.0` | Utility CSS. Entry point is `@import "tailwindcss"` at `globals.css:1` |
| `@tailwindcss/postcss`, `postcss` | Tailwind v4's PostCSS plugin, wired in `frontend/postcss.config.mjs` |
| `eslint`, `eslint-config-next` | Linting; also the source of the `react-hooks/exhaustive-deps` rule discussed in `06-frontend-crud.md` |

### The unused things — say these before you're asked

1. **`lucide-react` is a dead dependency.** Every icon in the app is hand-written inline
   SVG (`TopNav.tsx:25-103`, `Drawers.tsx:15-29`, `AwsLogo.tsx`, `login/page.tsx:51-75`)
   or a Cloudscape icon-name prop (`iconName="refresh"`,
   `hosted-zones/page.tsx:302`; `iconName="status-info"`, `AppShell.tsx:143`). It was
   presumably added at scaffold time and never removed. **Fix:** `npm uninstall
   lucide-react` — it's a one-line, zero-risk change that removes a dependency from the
   tree.

2. **`frontend/src/lib/auth.ts` is dead code — and worse, it's *wrong* dead code.**
   Nothing imports it (verified by grep across `frontend/src`). It defines a parallel,
   conflicting cookie scheme:

   | | `lib/auth.ts` (dead) | `lib/api.ts` (live) |
   |---|---|---|
   | Cookie name | `"token"` (`:4`) | `"r53_token"` (`api.ts:6`) |
   | Expiry | 7 days (`:4`) | 1 day (`api.ts:24`) |
   | `secure` | `true` (`:4`) | not set |
   | `sameSite` | `"strict"` (`:4`) | `"lax"` (`api.ts:24`) |

   This is the most dangerous kind of dead code: a future developer who imports
   `setAuthToken` instead of `setToken` gets a login that appears to work and an
   interceptor that never finds a token, because the interceptor reads `r53_token`
   (`api.ts:16`). **Fix:** delete the file. If any of its settings are *better* — and
   `secure: true` is — port that one attribute into `api.ts:24` and then delete.

3. **`frontend/tailwind.config.ts` is vestigial.** Tailwind v4 configures itself from CSS
   (`@theme inline` in `globals.css:81-102`); a v3-style `content`/`theme` config file is
   not read by the v4 PostCSS pipeline. Harmless, but misleading.

4. **`ROUTING_POLICY_OPTIONS` is declared twice.**
   - `frontend/src/lib/routingPolicies.ts:39-48` — the good one: typed `RoutingPolicy`
     union, a `supported: boolean` flag, and a `description` explaining *why* each policy
     is unavailable (`:37`). Its 16-line file header (`:1-16`) documents that only Simple
     routing works end to end because the other policies need per-policy fields (weight,
     set identifier, region, CIDR collection) the backend has no storage for.
   - `frontend/src/lib/dnsValidation.ts:106-115` — a flat `{value, label}[]` with none of
     that context.

   **The pages use the `dnsValidation` one** — `RecordForm.tsx:19-28` and
   `records/create/page.tsx:25-36` both import `ROUTING_POLICY_OPTIONS` from
   `@/lib/dnsValidation`. So the careful `supported`/`description` metadata is never
   rendered: the dropdowns offer all eight policies as if they all worked, and selecting
   Weighted stores the string "Weighted" while silently dropping the fields that make it
   mean anything — exactly the outcome `routingPolicies.ts:13-16` says it wanted to avoid.

   `routingPolicies.ts` is imported for one thing only: `ROUTING_POLICY_VALUES` in
   `records/page.tsx:33`, to populate the filter dropdown.

   **Fix:** delete the copy in `dnsValidation.ts`, import from `routingPolicies.ts`, and
   pass `supported`/`description` through to Cloudscape `Select`'s `disabled` and
   `description` option fields. That's ~10 lines and it turns a lie into an honest UI.

5. **No tests of any kind.** No `__tests__`, no `*.test.tsx`, no Jest/Vitest/Testing
   Library/Playwright in `package.json`. The highest-value first tests would be pure and
   trivial to write: `dnsValidation.ts` (447 lines of branchy per-record-type rules) and
   `parseZoneFile` in `import/page.tsx:55-153` (a real RFC 1035 parser). Both are pure
   functions — no DOM, no mocks. `parseZoneFile` would need extracting to `lib/` first,
   which is worth doing anyway.

---

## 11. If they ask…

**"Why Context and not Redux?"**
Five independent slices, roughly a dozen state fields, no cross-slice derivation, no need
for a transaction log. Redux would add a store, actions and selectors to solve a problem
this app doesn't have. The scaling limits are real and I can name them: a context re-renders
all its consumers on any change, so a widely-consumed, frequently-changing context needs
splitting or memoising. The thing I'd actually add is not Redux but TanStack Query — server
cache is the gap, not client state.

**"Client vs server components — what did you choose and why?"**
Everything except the root layout and two pure modules is `"use client"`. The forcing
constraint is that auth is a browser-cookie bearer token read in an axios interceptor
(`api.ts:15-21`), so the data layer can't run on the server as written. Every screen is
also interactive, and Cloudscape components are client components. I'd call it a missed
opportunity rather than a mistake: the backend already sets an httpOnly session cookie and
`api.ts:11` sends `withCredentials: true`, so moving the initial hosted-zones fetch into a
server component is a real available improvement — it would kill the first-load spinner and
ship less JS.

**"How does the auth guard work?"**
`AppShell` is the guard (`AppShell.tsx:73-96`). It reads `{ user, loading }` from
`AuthContext`; an effect redirects to `/login` with `router.replace` once `loading` is
false and there's no user; and it returns a blank themed div *before* rendering children
while loading, so protected content never flashes. `AuthContext` populates `user` on mount
by calling `authService.me()` if a token cookie exists (`AuthContext.tsx:23-42`). It's a
UI guard, not a security boundary — the API enforces auth. Middleware reading the httpOnly
cookie would be the proper fix.

**"How is dark mode implemented without a flash?"**
Three pieces. An inline synchronous `<script>` in `<head>` reads `localStorage` and adds
`.dark` to `<html>` before first paint (`layout.tsx:12-27`) — that's what kills the flash,
because React effects run after paint and can't. `ThemeContext` then adopts that value on
mount, and on every change writes three things at once: the `.dark` class, Cloudscape's
`applyMode`, and `localStorage` (`ThemeContext.tsx:22-39`). And `globals.css` redefines
~28 CSS custom properties under `.dark` (`:44-78`), with `@theme inline` republishing them
as Tailwind utilities. The `applyMode` call is the easy one to miss — Cloudscape reads its
own root class, so without it half the UI stays light.

**"Why does `Modal` return null when it's closed?"**
To fix a hydration mismatch that appeared on *every* page. `ShortcutsProvider` mounts the
shortcuts modal unconditionally (`ShortcutsContext.tsx:31`) and wraps the whole app.
Cloudscape's `Modal` mounts a portal placeholder even when hidden; that node exists in the
client DOM but not in the server HTML, so React's hydration diff failed everywhere.
Returning `null` before touching Cloudscape means both sides render nothing
(`Modal.tsx:29-33`). Bonus: closed dialogs are genuinely absent from the DOM.

**"Why is the shared shell a component instead of a `layout.tsx`?"**
Because `/login`, `/signup` and `/` must not have it, and opting out of a root layout means
route groups. Making it a component means each page opts in. The cost is a duplicated
`breadcrumbs` array in twelve files and — because a component unmounts on navigation where a
layout would persist — the side-nav open state and split-panel width reset on every page
change. Split-panel open/position survive only because they live in `DrawerContext`, above
the router. Route groups (`(auth)` / `(console)`) with a real layout would be the cleaner
version.

**"Why does `useDrawer` throw but the other four hooks don't?"**
`DrawerContext` is created with `null` and the hook guards it
(`DrawerContext.tsx:38,81-85`). Auth and Notification are created with
`null as unknown as T` (`AuthContext.tsx:16`, `NotificationContext.tsx:20`) — a cast that
tells TypeScript the value is always present and produces a bare `TypeError` if it isn't.
Theme and Shortcuts have real no-op defaults, so they fail silently. `useDrawer` is the
pattern the other four should follow; that's a change I'd make.

**"How do the keyboard shortcuts avoid hijacking typing?"**
`useHotkey` checks `isTypingTarget(e.target)` before firing and bails on
`INPUT`/`TEXTAREA`/`SELECT`/`contentEditable` (`useHotkey.ts:5-9,24`), unless the caller
passes `allowInInputs` — which only Alt+S does, because it focuses the search box from
inside the search box. It also compares `e.altKey !== alt` so `Alt+S` doesn't double-fire a
bare `s` handler.

**"Why target focus by `getElementById` instead of a ref?"**
The handlers are registered in `ShortcutsProvider`, which sits above the router; the
elements they focus live below it and change with the route
(`TopNav.tsx:225` for the global search, `controlId="page-filter-input"` on whichever page's
`TextFilter` is mounted — `hosted-zones/page.tsx:327`,
`records/page.tsx:432`). A ref would require a registration context where each page publishes
its filter ref on mount and clears it on unmount. That's real machinery for one lookup. It's
the one place the app reaches around React; the risks are that ids aren't type-checked and a
duplicate id silently focuses the wrong element. `?.focus()` makes it a no-op on pages
without a filter.

**"What's dead or duplicated in here?"**
Four things, and I'd fix all four in under an hour. `lucide-react` is a dependency that's
never imported. `lib/auth.ts` is an unreferenced module defining a *different* cookie
(`"token"`, 7 days, strict) from the live one in `api.ts` (`"r53_token"`, 1 day, lax) —
dangerous because importing it would produce a login that silently doesn't authenticate.
`ROUTING_POLICY_OPTIONS` exists in two files and the pages use the *worse* copy, so the
`supported: false` metadata that would disable unimplemented policies never reaches the UI.
And `tailwind.config.ts` is a v3-shaped config that Tailwind v4 doesn't read.

**"What would you do next, if you had a week?"**
In order: (1) add TanStack Query and delete the hand-rolled load/refetch code — it removes
the debounce-plus-`useCallback` machinery in §2 of `06-frontend-crud.md`, gives cache and
dedup for free, and fixes the triple-fetch in `refreshAll` (`records/page.tsx:238-242`);
(2) extract `parseZoneFile` (`import/page.tsx:55-153`) into `lib/` and unit-test it along
with `dnsValidation.ts` — 500 lines of branchy pure logic with zero coverage today;
(3) move the auth guard into middleware; (4) delete the dead code in §10.
