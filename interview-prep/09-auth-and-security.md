# 09 — Auth & Security

> ### TL;DR — the 6 things you must be able to say
>
> 1. **Auth is stateless JWT** — a 24-hour HS256 token issued two ways at once: an httpOnly cookie for the browser and the same token in the response body for `curl`/CI. The honest gap is revocation: logout only clears the cookie, so a copied Bearer token stays valid for its full 24 hours.
> 2. **bcrypt, not SHA-256** — bcrypt is *deliberately* slow and tunable (~10 hashes/sec at cost 12) and salts itself; SHA-256 is a fast checksum, which is exactly what an attacker wants.
> 3. **Signed ≠ encrypted** — the payload is base64url, readable by anyone holding the token, so nothing secret may ever go in it; mine holds `sub` and `exp` only.
> 4. **`Depends(get_current_user)` gates every protected route** — cookie first, `Authorization: Bearer` fallback, then a DB lookup, which is what makes a deleted user lose access immediately.
> 5. **The httpOnly cookie is undone by a second cookie** — the frontend writes a JS-readable `r53_token` copy of the same JWT, so an XSS can still steal it ([§5](#two-cookies)).
> 6. **Multi-tenancy is `owner_id` in the SQL `WHERE` clause at seven sites**, and a foreign resource returns 404 rather than 403 so tenant existence can't be probed.
>
> **Read** §1–§7 (~20 min). **Look up** everything under 🔎 Reference — never read it linearly.

> Everything here is verified against the running API. The JWT and cookie shown below are real
> captures from `http://localhost:8000`, and all code carries `file:line` references. The whole
> auth system lives in **one file**: `backend/app/routes/auth.py`, 140 lines. Read the box
> above out loud and you have the 30-second version.

---

## 1. Login, end to end

```
   Browser                          FastAPI                        SQLite
      │                                │                              │
  1.  │ POST /api/auth/login           │                              │
      │ {email, password}              │                              │
      ├───────────────────────────────▶│                              │
      │                                │ 2. Pydantic parses           │
      │                                │    LoginRequest              │
      │                                │                              │
      │                                │ 3. SELECT * FROM users       │
      │                                │    WHERE email = ?           │
      │                                ├─────────────────────────────▶│
      │                                │◀─────────────────────────────┤
      │                                │    User(hashed_password=...) │
      │                                │                              │
      │                                │ 4. bcrypt.verify(plain, hash)│
      │                                │    ~100ms, deliberately slow │
      │                                │                              │
      │                                │ 5. create_access_token       │
      │                                │    {"sub": email, "exp": +24h}│
      │                                │    signed HS256 w/ SECRET_KEY│
      │                                │                              │
      │                                │ 6. set_session_cookie(...)   │
      │◀───────────────────────────────┤                              │
  7.  │ 200 + Set-Cookie: access_token │                              │
      │     + {"access_token": "..."}  │                              │
      │                                │                              │
  8.  │ GET /api/zones                 │                              │
      │ Cookie: access_token=...       │                              │
      ├───────────────────────────────▶│ 9. get_current_user          │
      │                                │    jwt.decode → verify sig   │
      │                                │    → check exp               │
      │                                │    → SELECT user by sub      │
      │                                │ 10. WHERE owner_id = user.id │
      │◀───────────────────────────────┤                              │
```

### Step 1–2: the request is parsed

```python
class LoginRequest(BaseModel):
    email: str
    password: str
```
> `backend/app/schemas.py:9-11`

**Note what's absent: no validators.** `RegisterRequest` right below it validates email format
and an 8-character minimum (`schemas.py:14-32`), but `LoginRequest` validates nothing. That's
deliberate — login must not tell an attacker *why* a credential failed. A malformed email and
a wrong password produce the identical 401.

### Step 3–4: the password is verified

```python
@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
```
> `backend/app/routes/auth.py:90-97`

The condition `if not user or not verify_password(...)` collapses two failures into one
response. "No such account" and "wrong password" are indistinguishable — otherwise the
endpoint becomes a **user-enumeration oracle**: an attacker submits a list of emails with a
junk password, learns which addresses are registered, then targets those.

```python
def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)
```
> `backend/app/routes/auth.py:26-27`

> **Weakness → fix.** Python's `or` short-circuits: if the email doesn't exist,
> `verify_password` never runs, so the response returns in ~1 ms instead of ~100 ms. That's a
> **timing side channel** — the same enumeration leak the shared message was meant to close,
> measured with a stopwatch instead of read off the screen. The fix is to always perform a
> hash comparison: keep a dummy bcrypt hash and verify against it when the user is missing,
> so both paths cost the same. Worth volunteering unprompted — it shows you think past the
> obvious control to the side channel.

### Step 5: the token is minted

```python
def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
```
> `backend/app/routes/auth.py:34-38`

```python
    token = create_access_token({"sub": user.email})
```
> `backend/app/routes/auth.py:99`

### Step 6–7: the token is delivered twice

```python
    set_session_cookie(response, token)
    return TokenResponse(access_token=token)
```
> `backend/app/routes/auth.py:100-101`

**Real capture** (full transcript in R3.1):

```
set-cookie: access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vQHJvdXRlNTMuYXdzIiwiZXhwIjoxNzg1Mzg2NjM0fQ.C2M8SognTplFaNga3yKA4quH1GEos4TWjYkdBBTmNGE; HttpOnly; Max-Age=86400; Path=/; SameSite=lax
```

The same token lands in two places: the `Set-Cookie` header (browser, automatic) and the JSON
body (curl/Postman/CI, manual). Why both — §5.

### Steps 8–10: subsequent requests

`get_current_user` (`auth.py:52-74`) runs as a dependency on every protected route; the route
then filters by `owner_id`. Both covered in §4 and §6.

---

## 2. Password hashing with bcrypt

### What hashing is, and what a salt is for

A cryptographic hash is one-way: `hash(password)` is cheap, `unhash(digest)` is infeasible.
Store only the digest, and at login hash the submitted password and compare. A database breach
then leaks digests, not passwords — which matters enormously, because people reuse passwords
across sites.

**Jargon: salt** — a random value generated per password and mixed into the hash. It is stored
*alongside* the digest, in the clear. It is not a secret. Without a salt, identical passwords
hash identically:

```
alice: "password123" → 482c811da5d5b4bc6d497ffa98491e38
bob:   "password123" → 482c811da5d5b4bc6d497ffa98491e38   ← same digest!
```

Two consequences: an attacker instantly sees which users share a password, and — far worse —
can attack **every user at once** with a precomputed table (a rainbow table) of common
passwords. With a per-user salt the same password produces different digests, so each must be
attacked individually, and a rainbow table would have to be recomputed for every distinct
salt.

### Why bcrypt, not SHA-256

This is the answer interviewers are listening for. **SHA-256 is designed to be fast** — a
virtue for checksums and signatures, a catastrophe for passwords, because an attacker with a
GPU tries billions of candidates per second against a stolen digest. **bcrypt is designed to
be slow, and adjustably so:** it has a *cost factor* (work factor), so cost 12 means 2¹² =
4,096 internal iterations and each +1 doubles the time. It is also deliberately
**memory-hard** in a way that frustrates GPU and ASIC parallelism, which SHA-256 — built for
exactly that hardware — is not.

| | SHA-256 | bcrypt |
|---|---|---|
| Design goal | Fast | Deliberately slow |
| Speed | Billions/sec on a GPU | ~10/sec at cost 12 |
| Salting | You must add it yourself | Built in, automatic, per-hash |
| Tunable cost | No | Yes — raise it as hardware improves |
| GPU-friendly | Very (bad for us) | Resistant |

The arithmetic: a stolen SHA-256 digest of an 8-character password falls in hours; the same
password bcrypt-hashed at cost 12 takes centuries on the same hardware. **The slowness is the
whole point** — ~100 ms is imperceptible for one legitimate login and ruinous for an attacker
doing billions.

Also worth naming: bcrypt is now the *middle* option. **Argon2id** won the 2015 Password
Hashing Competition and is the current recommendation — memory-hard in a stronger, tunable
way. **scrypt** is a reasonable alternative. bcrypt is still perfectly acceptable and
battle-tested; Argon2id would be the modern choice.

### What `CryptContext` gives you

```python
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
```
> `backend/app/routes/auth.py:16`

```python
def hash_password(password: str) -> str:
    return pwd_context.hash(password)
```
> `backend/app/routes/auth.py:30-31`

passlib's `CryptContext` is an abstraction over hashing schemes. It gives you:

1. **Automatic salting.** `pwd_context.hash("x")` generates a fresh random salt each call. You
   never touch it.
2. **Self-describing digests.** The output encodes everything needed to verify it:
   ```
   $2b$12$LQv3c1yqBWVHxkd0LHAkCO....
    │   │  └── 22-char salt + 31-char digest
    │   └── cost factor: 12
    └── algorithm: 2b = bcrypt
   ```
   So `verify()` needs no extra columns — no `salt` field, no `algorithm` field.
3. **Constant-time comparison.** `verify()` avoids the timing leak of `==` on digest strings.
4. **Migration support.** `deprecated="auto"` means that if you later add a stronger scheme
   (`schemes=["argon2", "bcrypt"]`), passlib marks bcrypt hashes as needing rehash and
   `verify_and_update()` transparently upgrades each user's hash on their next successful
   login. **This is the real reason to use passlib over raw bcrypt** — with a single scheme
   configured, as here, it's buying very little.

### The `bcrypt==4.0.1` pin

```
passlib[bcrypt]==1.7.4
bcrypt==4.0.1
```
> `backend/requirements.txt:6-7`

passlib 1.7.4 (2020) detects the bcrypt backend version via `bcrypt.__about__.__version__`.
bcrypt 4.1 **removed** that internal `__about__` module. On `passlib==1.7.4` + `bcrypt>=4.1`
the first hash call raises inside passlib's version detection — **every login and registration
breaks**, with a traceback pointing at passlib's internals rather than your code. Pinning
4.0.1 preserves the attribute.

> **Weakness → fix.** Holding a security-relevant library one minor version back is a smell
> even when it's the documented workaround, because you also stop receiving that library's
> fixes. The real fix is to drop passlib and call `bcrypt.hashpw` / `bcrypt.checkpw` directly,
> or move to `pwdlib`/`argon2-cffi`. passlib has been effectively unmaintained since 2020, and
> `CryptContext`'s main value — multi-scheme migration — isn't being used here.

---

## 3. JWT — structure, claims, and signed ≠ encrypted

**Jargon: JWT (JSON Web Token)** — a compact, URL-safe, *self-contained* credential. The server
can validate it using only a secret key, with **no database lookup and no server-side session
store**. That statelessness is the entire point, and also the source of every JWT trade-off.

### Structure: three base64url segments joined by dots

Decoding the **real token** captured above:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 . eyJzdWIiOiJkZW1vQHJvdXRlNTMuYXdzIiwiZXhwIjoxNzg1Mzg2NjM0fQ . C2M8SognTplFaNga3yKA4quH1GEos4TWjYkdBBTmNGE
└──────────── HEADER ────────────────┘ └──────────────── PAYLOAD ──────────────────────────────┘ └───────────── SIGNATURE ──────────────┘
```

```console
$ python -c "import base64,json; ..."   # decoding the captured token

header : {"alg": "HS256", "typ": "JWT"}
payload: {"sub": "demo@route53.aws", "exp": 1785386634}
sig    : C2M8SognTplFaNga3yKA4quH1GEos4TWjYkdBBTmNGE
exp as UTC: 2026-07-30 04:43:54
```

That token was issued at 2026-07-29 04:43:54 UTC and expires exactly 24 hours later — matching
`ACCESS_TOKEN_EXPIRE_MINUTES` defaulting to 1440 (`auth.py:20`).

### The claims used here

**Jargon: claim** — one key/value statement inside the payload. Some names are registered by
RFC 7519; the rest are yours.

| Claim | Value here | Type | Meaning |
|---|---|---|---|
| `sub` | `"demo@route53.aws"` | registered | **Subject** — who the token is about |
| `exp` | `1785386634` | registered | **Expiry**, Unix seconds. Verification fails after this |

Two claims, that's all — set at `auth.py:99` (`{"sub": user.email}`) and `auth.py:37`
(`to_encode.update({"exp": expire})`). The registered claims this app does *not* use, and what
each would buy, are in R2.3.

**Why `sub` is the email and not the user ID:** the email is the natural business key and is
`unique=True` on the table (`models.py:37`), so `get_current_user` looks the user up by it
(`auth.py:71`).

> **Weakness → fix.** If a user ever changes their email, every outstanding token becomes
> unresolvable — `get_current_user` would 401 with "User not found" until they re-login. Using
> the immutable integer `id` as `sub` avoids that entirely. There's no email-change endpoint
> today, so it's latent rather than live, but it's the right thing to name.

### How signing and verification work

The algorithm is **HS256** — HMAC with SHA-256. It is *symmetric*: one secret both signs and
verifies.

```
SIGN (login):
    unsigned = base64url(header) + "." + base64url(payload)
    signature = HMAC-SHA256(unsigned, SECRET_KEY)
    token = unsigned + "." + base64url(signature)

VERIFY (every request):
    recompute HMAC-SHA256(received_header.received_payload, SECRET_KEY)
    compare with the received signature   → mismatch = forged/tampered
    then check exp > now                  → expired = reject
```

```python
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
```
> `backend/app/routes/auth.py:64`

Passing `algorithms=[ALGORITHM]` as a **whitelist** is important. It's the standard defence
against the classic JWT attacks: `alg: none` (attacker strips the signature and claims the
token is unsigned) and algorithm confusion (attacker swaps RS256 for HS256 so the *public* key
gets used as an HMAC secret). Pinning the accepted algorithm list closes both. `python-jose`
is doing the right thing here.

**Verified live** — one character appended to a valid token breaks the signature:

```console
$ curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs...BBTmNGEx" \
    http://localhost:8000/api/auth/me
{"detail":"Invalid token"}      # HTTP 401
```

You cannot forge a token without `SECRET_KEY`, and you cannot alter `sub` to impersonate
someone, because the signature covers the payload.

### 🔴 Signed ≠ encrypted — the single most important JWT fact

**The payload is base64url-encoded, not encrypted. Anyone holding the token can read it.**
Base64 is an encoding, not a cipher — no key required. I decoded a real token above with three
lines of Python and no secret; anyone can paste one into jwt.io.

```
SIGNED      →  cannot be MODIFIED without the secret   (integrity + authenticity)
SIGNED      →  CAN be READ by anyone                   (no confidentiality!)
ENCRYPTED   →  cannot be read without the key           (that's JWE, not used here)
```

**Consequence: never put anything secret in a JWT payload.** No passwords, no API keys, no PII
beyond what the holder already knows about themselves, no internal flags you'd rather users
not see. This app is fine on that count — `sub` is the user's own email and `exp` is a
timestamp, both already known to whoever holds the token.

**Interview soundbite:** *"A JWT is signed, not encrypted. The signature guarantees nobody
tampered with it, but the payload is just base64 — I can decode any token in one line without
the secret. So the rule is: never put anything in a JWT you wouldn't hand to the user. Mine
holds `sub` and `exp` and nothing else. If I genuinely needed confidentiality I'd need JWE, or
I'd go back to opaque session IDs."*

### Where the secret comes from

```python
SECRET_KEY = os.getenv("SECRET_KEY", "fallback-secret-key")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))
```
> `backend/app/routes/auth.py:18-20`

The fallback default is a real problem — see R1.1.

---

## 4. `get_current_user` — the gate on every protected route

```python
def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get("access_token")
    if not token:
        # also check Authorization header
        auth = request.headers.get("Authorization")
        if auth and auth.startswith("Bearer "):
            token = auth.split(" ")[1]

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
```
> `backend/app/routes/auth.py:52-74`

```
 cookie "access_token"? ──yes──┐          ← COOKIE WINS
 else Authorization: Bearer? ──yes──┤
 neither → 401 "Not authenticated"  ▼
        jwt.decode(token, SECRET_KEY, [HS256])   bad signature → 401 "Invalid token"
                     │                           expired      → 401 "Invalid token"
                     ▼
        payload["sub"] → email                   missing      → 401 "Invalid token"
                     ▼
        SELECT * FROM users WHERE email = ?      no row       → 401 "User not found"
                     ▼
        return User ──▶ injected into the handler
```

Four notes worth making in an interview:

| Note | Why it matters |
|---|---|
| **Cookie takes priority** | The header is only consulted when no cookie is present |
| **The DB lookup on every request is a deliberate cost** | A purist stateless JWT would trust the claims and skip it. Doing the lookup means a **deleted user is locked out immediately** rather than remaining authenticated until their token expires — a small revocation win bought with one indexed query. It also means `current_user` is a live ORM object, so handlers can use it in queries directly |
| **Two distinct 401 messages** | `"Not authenticated"` = no credential presented; `"Invalid token"` = a credential was presented and failed. Both verified live |
| **It's used ~17 times** | Every protected endpoint declares it. That repetition is what makes auth impossible to forget on a new route: it's in the signature, and it's visible in Swagger |

> **Weakness → fix.** `token = auth.split(" ")[1]` (`auth.py:58`) would raise `IndexError` on a
> header of exactly `"Bearer "` with nothing after it — an unhandled 500 instead of a clean
> 401. It's guarded by `startswith("Bearer ")`, so the input must be exactly that string with
> no token, but the fix is trivial: `auth.split(" ", 1)[1].strip()` plus an emptiness check, or
> use FastAPI's built-in `HTTPBearer` security scheme (which also makes the auth requirement
> appear correctly in the OpenAPI spec, with an "Authorize" button in Swagger UI).

---

## 5. Cookie vs Bearer — the trade-off, and why both

### The cookie

```python
def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="none" if IS_PRODUCTION else "lax",
        secure=IS_PRODUCTION,
    )
```
> `backend/app/routes/auth.py:41-49`

`httponly=True` means **JavaScript cannot read this cookie**; `max_age` (86400 s) matches the
JWT's own `exp`; `samesite` and `secure` flip by environment. Flag-by-flag reference: R2.1.

### The XSS/CSRF trade-off — the core question

**Jargon: XSS (Cross-Site Scripting)** — an attacker gets *their* JavaScript running on *your*
page (an unescaped comment, a compromised dependency, a malicious ad); it then runs with full
access to your origin.

**Jargon: CSRF (Cross-Site Request Forgery)** — a *different* site (`evil.com`) causes the
victim's browser to send a request to your API. The browser attaches the victim's cookies
automatically, so it looks authenticated. The attacker can't *read* the response (CORS blocks
that), but the side effect — "delete my zone" — already happened.

Neither storage option is safe against both:

| Storage | XSS | CSRF | Notes |
|---|---|---|---|
| `localStorage` | **Vulnerable** — any script reads it | Immune — not auto-attached | The common SPA choice, and the riskier one |
| httpOnly cookie | **Protected** — JS can't read it | **Vulnerable** — auto-attached | Needs SameSite or CSRF tokens |
| httpOnly + `SameSite=Lax`/`Strict` | Protected | Largely mitigated | **What this app does in dev** |

**This app chose the httpOnly cookie as the browser's primary mechanism**, which is the right
call. The reasoning: XSS is a *total* compromise — if an attacker can run JavaScript on your
origin they can read `localStorage`, exfiltrate the token, and replay it from their own
machine forever, offline. CSRF is *bounded* — the attacker can trigger actions but never read
responses, and `SameSite` blocks most of it with a single flag. httpOnly turns "token stolen
permanently" into "attacker must operate through the victim's live browser session."

<a id="two-cookies"></a>

### ⚠️ But there are actually **two** cookies — and the second one undoes the first

Everything above describes what the *backend* does. The frontend independently stores a
**second copy of the same JWT**, and that copy is **not** httpOnly.

`frontend/src/lib/api.ts:6,23-25`:

```ts
export const TOKEN_COOKIE = "r53_token";

export function setToken(token: string) {
  Cookies.set(TOKEN_COOKIE, token, { expires: 1, sameSite: "lax" });
}
```

`Cookies` is `js-cookie` — a library that writes cookies **from JavaScript**, so by definition
the cookie it creates cannot be httpOnly. `AuthContext.tsx:46` calls `setToken(token)` on
login and `:53` on signup. The interceptor then reads it back and attaches it as a Bearer
header on every request (`api.ts:15-21`):

```ts
api.interceptors.request.use((config) => {
  const token = Cookies.get(TOKEN_COOKIE);
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

So after a browser login the JWT exists in two places:

| Cookie | Set by | httpOnly? | Readable by JS? |
|---|---|---|---|
| `access_token` | the backend (`auth.py:43`) | ✅ yes | ❌ no |
| `r53_token` | the frontend (`api.ts:24`) | ❌ **no** | ✅ **yes** |

**Why this matters:** the entire XSS argument for httpOnly is that an injected script can't
read the token. Here it can — it just reads `r53_token` instead. `document.cookie` returns it,
and one line of injected JavaScript exfiltrates a valid 24-hour token. The httpOnly flag on
`access_token` is doing **no** practical work in the browser, because the identical secret
sits next to it in plain reach.

Verify it yourself: log in, then run `document.cookie` in the browser console. You'll see
`r53_token=eyJhbGci…` and you will *not* see `access_token` — which is exactly the problem.

**Why it's there:** it makes the client's auth state synchronously inspectable — `hasToken()`
(`api.ts:31-33`) lets `AuthContext` skip the `/auth/me` round trip when there's clearly no
session (`AuthContext.tsx:26`). An httpOnly cookie is invisible to JS, so it can't answer that
question. It's a convenience, and it was paid for with the security property.

**The fix, and it's small:** delete `setToken`/`hasToken` and the request interceptor entirely.
`withCredentials: true` (`api.ts:11`) already sends the httpOnly cookie, and the backend
already prefers it (`auth.py:53`). To replace `hasToken()`, either just call `/auth/me` and
treat a 401 as "logged out", or have the backend set a second **non-sensitive** flag cookie
(`r53_signed_in=1`) that contains no token at all. Bearer support stays for `curl` and scripts
— it simply stops being how the *browser* authenticates.

> **Say this in an interview and it lands hard.** "I used an httpOnly cookie" is a textbook
> answer. "I used an httpOnly cookie, and then I found the frontend was also writing a
> JS-readable copy of the same token, which defeats it — here's why it was added and here's the
> two-line fix" is the answer of someone who audited their own system instead of reciting the
> pattern.

### `SameSite` — and why production flips it

```python
# In production the frontend and backend live on different domains, so the session
# cookie needs SameSite=None + Secure to be sent cross-site at all (requires HTTPS).
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development") == "production"
```
> `backend/app/routes/auth.py:21-23`

The three `SameSite` values and what each does: R2.2. **Why the flip is forced, not chosen:**

- **Dev:** frontend on `localhost:3000`, API on `localhost:8000`. Same site (ports don't affect
  SameSite), so `lax` works, and `secure=False` is required because `http://localhost` isn't
  HTTPS — a `Secure` cookie would simply never be stored.
- **Prod:** frontend on Vercel, API on Render — genuinely different registrable domains. Under
  `lax`, the browser would refuse to attach the cookie to the SPA's `fetch` calls and the user
  would appear logged out on every request. `none` is the only value that works, and the spec
  **requires** `Secure` alongside it. (The dev capture above shows exactly those flags:
  `HttpOnly; Max-Age=86400; Path=/; SameSite=lax`.)

> **⚠️ The security cost of this, stated plainly.** `SameSite=None` **removes the browser's
> built-in CSRF protection in production.** In dev, `Lax` means a cross-site POST won't carry
> the cookie. In prod it will. Combined with `allow_methods=["*"]` and `allow_credentials=True`
> in the CORS config (`main.py:54-55`), the deployed app is meaningfully more exposed to CSRF
> than the dev one — and this is the environment-specific gap most people miss.
>
> **The fixes, in order of preference:** (1) put the frontend and API on the same registrable
> domain — `app.example.com` and `api.example.com` are same-site, so `SameSite=Lax` works and
> the problem disappears; (2) add a double-submit CSRF token — a second, non-httpOnly cookie
> the SPA reads and echoes in an `X-CSRF-Token` header, which `evil.com` can't do because it
> can't read cross-origin cookies; (3) at minimum, require a custom header on all mutating
> requests, since sending one triggers a CORS preflight that the origin allowlist then rejects.

### Why support Bearer at all?

Because not every client is a browser. `curl`, Postman, CI scripts and server-to-server
callers have no cookie jar. Returning the token in the body too (`auth.py:101`) means one auth
system serves both, and both paths are verified to return the identical `/auth/me` response
(R3.2). Every `curl` example in `04-backend-apis.md` exists because of this dual support.

> **The honest cost:** the Bearer path is *not* CSRF-vulnerable (headers aren't auto-attached),
> but it's also not XSS-protected, and — most importantly — **logout cannot touch it.** See
> R1.2.

---

## 6. Multi-tenancy — how one user can't see another's zones

The rule is enforced in **SQL**, not in application logic after the fact:

```python
    query = db.query(HostedZone).filter(HostedZone.owner_id == current_user.id)
```
> `backend/app/routes/zones.py:76`

```python
def get_zone_or_404(zone_id: int, db: Session, current_user: User) -> HostedZone:
    zone = (
        db.query(HostedZone)
        .filter(HostedZone.id == zone_id, HostedZone.owner_id == current_user.id)
        .first()
    )
    if not zone:
        raise HTTPException(status_code=404, detail="Hosted zone not found")
    return zone
```
> `backend/app/routes/records.py:31-39`

**The ownership predicate is part of the `WHERE` clause.** That distinction matters: the
database never returns a foreign row, so there is no code path where a foreign object exists
in memory and someone forgot the `if`. The check can't be skipped because there's nothing to
skip.

Seven query sites:

| Site | `file:line` |
|---|---|
| `GET /zones` | `zones.py:76` |
| `POST /zones` — duplicate-name check | `zones.py:117` |
| `GET /zones/{id}` | `zones.py:151` |
| `PUT /zones/{id}` | `zones.py:168` |
| `GET /zones/{id}/export` | `zones.py:196` |
| `DELETE /zones/{id}` | `zones.py:258` |
| `get_zone_or_404` — gates **all seven** record endpoints | `records.py:34` |

`zones.py:117` is the subtle one: zone-name uniqueness is scoped **per owner**, so two tenants
can each hold `example.com.` without colliding. I confirmed this in the live database —
`civicvoice.xyz.` exists twice, owned by user 1 and user 2. Records inherit isolation
transitively: every record endpoint calls `get_zone_or_404` first, so a record ID from another
tenant's zone is unreachable even if guessed.

### 404, not 403 — verified

**Zone 4 genuinely exists** in the database and belongs to user 4. As the demo user (user 1):

```console
# EXISTS, but owned by someone else
$ curl -b cookies.txt http://localhost:8000/api/zones/4
{"detail":"Hosted zone not found"}      # HTTP 404

$ curl -b cookies.txt http://localhost:8000/api/zones/4/records
{"detail":"Hosted zone not found"}      # HTTP 404

# does NOT exist — byte-identical response
$ curl -b cookies.txt http://localhost:8000/api/zones/9999
{"detail":"Hosted zone not found"}      # HTTP 404
```

**Why:** 403 means *"this exists, but you may not have it"* — an information leak. An attacker
walking `/api/zones/1..1000` and logging 403s versus 404s learns exactly how many zones the
platform hosts and which IDs are live, without ever seeing contents. Returning 404 for both
makes *existence itself* unobservable across tenants. GitHub does the same for private repos;
it's the standard OWASP recommendation. It matters especially here because zone IDs are
**sequential integers** — if enumeration told you anything, it would tell you everything.

---

## 7. "If they ask…"

### Q1. JWT or sessions — and why did you choose JWT?

**Sessions:** the server stores session state (in Redis/DB) and gives the client an
opaque ID. Every request looks it up. Fully revocable, small cookie, but requires shared state
— which is a coordination problem across multiple instances.

**JWT:** the token *is* the state, signed so it can't be forged. No lookup needed, so
any instance can validate it independently. Not revocable before expiry.

| | Sessions | JWT |
|---|---|---|
| Server state | Required | None |
| Revocation | Immediate | Not until `exp` |
| Horizontal scaling | Needs shared store | Trivial |
| Cookie/token size | ~32 bytes | ~200+ bytes, every request |
| Microservices | Central store, or replication | Each service verifies independently |

**My reasoning here:** the deployment is a stateless container on Render with an
ephemeral filesystem — there is nowhere durable to keep sessions without adding Redis, which
is real infrastructure for a project this size. JWT removed that dependency entirely.

**The honest caveat:** it's a *partially* stateless implementation. `get_current_user`
queries the user on every request anyway (`auth.py:71`), so I'm paying a DB round-trip and
only getting *some* of statelessness' benefit. If I'm querying regardless, sessions would have
been a defensible choice too — and I'd have got revocation for free. I chose the DB lookup on
purpose so a deleted user is locked out immediately, but I'd flag the tension rather than
claim JWT was strictly better.

### Q2. Where do you store the token, and why?

**httpOnly cookie**, set at `auth.py:41-49` — plus the same token in the response body
for non-browser clients.

**Why not `localStorage`:** any JavaScript can read it. One XSS — an unescaped user
string, a compromised npm dependency — and the token is exfiltrated and replayable from the
attacker's own machine for its full lifetime, offline. That's a total, persistent compromise.

**httpOnly means JS cannot read the cookie at all.** An XSS can still *act* through the
victim's browser, but it can't steal a portable credential. The trade is CSRF exposure, which
`SameSite` addresses.

**The honest asterisk:** production uses `SameSite=None` (`auth.py:47`) because the
frontend and API are on different domains — which removes the browser's CSRF protection
exactly where it matters most. The right fix is a shared parent domain (`app.example.com` +
`api.example.com`), which makes `Lax` viable again; short of that, a double-submit CSRF token.

### Q3. How do you handle logout?

`POST /api/auth/logout` calls `response.delete_cookie(...)` (`auth.py:130-134`) with the
*same* `samesite` and `secure` flags used when setting it — cookie deletion only works
when the attributes match, which is why those are repeated.

**And that's all it does — the JWT itself stays valid.** There's no server-side session
to destroy; the endpoint doesn't even take a `db` or a `current_user`. So logout clears this
browser's cookie, but a token already copied elsewhere works via `Authorization: Bearer` for
the rest of its 24 hours.

That's the inherent cost of stateless JWTs, not an oversight. The production fix is
short-lived access tokens plus a stateful refresh token: logout deletes the refresh-token row,
and the access token dies in minutes rather than a day.

### Q4. What is CSRF, and are you vulnerable?

CSRF is when another site causes the victim's browser to send an authenticated request to your
API — the browser attaches cookies automatically, so it looks legitimate. The attacker can't
read the response (CORS blocks that), but the side effect already happened.

**In development: largely protected.** `SameSite=Lax` (`auth.py:47`) means the cookie
isn't attached to cross-site POST/PUT/DELETE requests, which is exactly the mutating class
CSRF targets.

**In production: meaningfully exposed.** `SameSite=None` is *required* because the SPA
and API are on different registrable domains, and it removes that protection. Combined with
`allow_credentials=True` and `allow_methods=["*"]` (`main.py:54-55`), a cross-origin form POST
from an attacker's page would carry the victim's cookie.

Partial mitigations already present: the CORS allowlist is explicit, never `*`
(`main.py:47-49`, forced by `allow_credentials=True`), and every mutating endpoint requires
`Content-Type: application/json`, which triggers a CORS preflight that the allowlist then
rejects. That stops the *simple* HTML-form attack. It is not a complete defence and I wouldn't
claim it as one.

**What I'd add:** put both on one parent domain so `Lax` works, or implement a
double-submit CSRF token — a second non-httpOnly cookie the SPA reads and echoes in an
`X-CSRF-Token` header, which `evil.com` cannot do because it can't read cookies from another
origin.

### Q5. How would you implement refresh tokens?

Short-lived access token (15 min) + long-lived refresh token (30 days) stored **hashed** in a
`refresh_tokens` table with `user_id`, `expires_at`, `revoked_at`.

The refresh token goes in its own httpOnly cookie scoped `Path=/api/auth/refresh`, so it's
only ever transmitted to the one endpoint that consumes it — never on ordinary API calls,
minimising exposure. `POST /api/auth/refresh` validates the row, issues a new access token,
and **rotates** the refresh token, revoking the old one.

Rotation is what makes theft detectable: if a stolen refresh token is replayed after the real
client already rotated, the server sees a reused token and revokes the whole family, forcing
re-authentication.

Logout deletes the row — so unlike today, logout genuinely ends the session.

On the client, an interceptor catches a 401, calls `/refresh` once, and retries the original
request; if the refresh fails, redirect to login. The concurrency detail worth mentioning:
queue simultaneous 401s behind a single in-flight refresh, or five parallel requests each
trigger their own rotation and invalidate each other.

**The trade-off I'd name:** this reintroduces server state, which is exactly what JWT was
chosen to avoid. That's the point — you concentrate statefulness in the *rare*, long-lived
credential and keep the *frequent* one stateless.

### Q6. If someone dumped your database, what could they do?

They'd have: emails, bcrypt hashes (`models.py:38`), and everyone's DNS data.

**They could not** read passwords — that's bcrypt's whole job, and cracking them
individually is infeasible at ~10 hashes/sec per candidate, with per-user salts making a
single precomputed table useless.

**They could not** forge tokens — `SECRET_KEY` lives in the environment, not the
database. *Unless* the app was running on the fallback default (R1.1), in which case they
wouldn't even need the dump.

**What I'd do:** rotate `SECRET_KEY` (which invalidates every outstanding token,
because signatures no longer verify — the one revocation lever a stateless system has), force
a password reset, notify users, and check the audit log — which doesn't exist yet, and that's
precisely why R1.7 matters.

### Q7. What's the single biggest security issue in this codebase?

`os.getenv("SECRET_KEY", "fallback-secret-key")` at `auth.py:18`.

If the env var is missing, the app boots **silently** and signs tokens with a known constant.
Anyone aware of it can forge a token for any account — complete auth bypass, no password, no
signal in any log.

The fix is three lines: raise on startup in production, generate a random key in development.
**Config that security depends on should crash the process, not default.** A failed deploy
gets fixed in ten minutes; a silently-insecure one runs for a year.

---

# 🔎 Reference — do not read this linearly

Everything below is lookup material: exhaustive inventories, per-site tables and full
snippets. Ctrl-F it when you need a specific fact; skip it on a read-through.

---

## R1. What a production system would add

Every item here is a real gap. Naming them unprompted is worth more in an interview than
pretending they don't exist — the skill being assessed is whether you know what "done" looks
like.

### R1.1 🔴 The `SECRET_KEY` fallback default

```python
SECRET_KEY = os.getenv("SECRET_KEY", "fallback-secret-key")
```
> `backend/app/routes/auth.py:18`

**This is the most serious issue in the codebase.** If `SECRET_KEY` is unset — a missing env
var on a new host, a typo'd variable name, a `.env` that didn't ship — the app starts
**silently** and signs tokens with the literal, now publicly-documented string
`"fallback-secret-key"`. Anyone who knows that string can forge a valid token for **any**
account:

```
jwt.encode({"sub": "victim@example.com", "exp": <future>}, "fallback-secret-key", "HS256")
```

That token passes `jwt.decode` at `auth.py:64` and `get_current_user` returns the victim's
`User`. Complete authentication bypass, no password needed — and no signal that it happened,
because the app looks perfectly healthy. The value is correctly kept out of the repo (`.env`
is gitignored; `.env.example:2` carries only the placeholder
`replace-with-a-long-random-string`), so the *design* is right — it's the **silent fallback**
that's dangerous, not the env-var approach.

> **Fix — fail fast at startup, never in production:**
> ```python
> SECRET_KEY = os.getenv("SECRET_KEY")
> if not SECRET_KEY:
>     if IS_PRODUCTION:
>         raise RuntimeError("SECRET_KEY must be set")
>     SECRET_KEY = secrets.token_urlsafe(32)   # dev-only, random per boot
> ```
> A crashed deploy is loud and gets fixed in ten minutes. A silently-insecure deploy runs for a
> year. Generating a *random* dev key also means dev tokens don't survive a restart, which is a
> feature. Better still: a Pydantic `BaseSettings` class that validates all config at import
> time — then *every* missing variable fails at once, with a readable message.

### R1.2 🔴 No revocation — logout only clears the cookie

```python
@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(
        "access_token",
        samesite="none" if IS_PRODUCTION else "lax",
        secure=IS_PRODUCTION,
    )
    return {"message": "Logged out successfully"}
```
> `backend/app/routes/auth.py:128-135`

Look at what's missing: no `db`, no `current_user`, no token blocklist. **There is nothing
server-side to destroy.** Logout is a *browser-side* operation — it tells this browser to
forget the cookie.

```
Logout clears:      the cookie in THIS browser                 ✓
Logout does NOT:    invalidate the token itself                ✗
                    stop a copy already saved elsewhere        ✗
                    log you out of other devices               ✗
```

**The concrete attack:** login returns the token in the response body too (`auth.py:101`). If
that token was captured — by an XSS payload, a shared machine, a logged proxy, a screenshot of
DevTools — clicking "Log out" does **nothing** to it. It stays valid via `Authorization:
Bearer` for the remainder of its 24 hours (`ACCESS_TOKEN_EXPIRE_MINUTES`, `auth.py:20`).

**This is not a bug — it is the inherent trade-off of stateless JWTs**, and being able to say
that precisely is the point. Statelessness means no session store to check, which is exactly
why there's no session to revoke. The one thing that *does* work: `get_current_user`
re-queries the user on every request (`auth.py:71`), so **deleting a user does lock them out
immediately**. Fix: refresh tokens plus a revocation list — R1.3.

### R1.3 Refresh tokens

The standard resolution of the JWT lifetime dilemma. A 24-hour access token is a long exposure
window; a 5-minute one means logging in every 5 minutes. Refresh tokens give you both:

| | Access token | Refresh token |
|---|---|---|
| Lifetime | 5–15 minutes | 7–30 days |
| Stored | In memory / cookie | httpOnly cookie, `Path=/api/auth/refresh` |
| Sent | Every request | Only to the refresh endpoint |
| Stateless? | Yes | **No — a row in the database** |
| Revocable? | No (but expires in minutes) | **Yes — delete the row** |

```
 login  ──▶  access (15 min)  +  refresh (30 days, row in DB)
                  │
                  ├─ used on every request until it expires
                  ▼
            401 expired
                  │
                  ▼
      POST /api/auth/refresh  (sends refresh cookie)
                  │
                  ├─ token row exists and not revoked? ──no──▶ 401, force re-login
                  ▼ yes
            new access token  (+ rotate the refresh token)
```

**Why this fixes revocation:** the *refresh* token is stateful, so logout deletes its row and
the session genuinely ends. The access token still can't be revoked — but it dies in 15
minutes, so the exposure window shrinks from 24 hours to minutes. That's the whole trick:
**push statefulness onto the long-lived credential and keep the high-frequency one stateless.**

Two refinements to mention:

- **Rotation.** Issue a new refresh token on each use and invalidate the old one. If a stolen
  refresh token is replayed after the legitimate client has already rotated, the server sees a
  reused token and can revoke the entire family — turning theft into a *detectable* event.
- **`jti` + a blocklist.** Add a `jti` claim to access tokens and keep revoked IDs in Redis with
  a TTL matching the token lifetime. That gives true immediate revocation, at the cost of a
  cache lookup per request. Only worth it if "log out everywhere, now" is a hard requirement.

Implementing it here means a `refresh_tokens` table (`token_hash`, `user_id`, `expires_at`,
`revoked_at`), `POST /api/auth/refresh`, a shortened `ACCESS_TOKEN_EXPIRE_MINUTES`, a logout
that deletes the row, and the frontend interceptor described in §7 Q5.

### R1.4 🔴 No rate limiting on login

```python
@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
```
> `backend/app/routes/auth.py:90-91`

**Unlimited login attempts.** An attacker can submit passwords as fast as the server responds.
bcrypt's ~100 ms cost is a real speed bump (~10 guesses/second/connection), but it's a speed
bump, not a lock — and it cuts both ways, because 100 concurrent login requests will
**saturate the threadpool** (see `03-backend-overview.md` §2) and take the whole API down.
Login is simultaneously the auth weak point and the cheapest DoS vector.

> **Fix — layered:**
> - **Per-IP:** `slowapi` (the FastAPI port of Flask-Limiter), e.g. `@limiter.limit("5/minute")`
>   on `/login`. One decorator.
> - **Per-account:** track failures per email so an attacker rotating IPs against one account is
>   still throttled.
> - **Exponential backoff:** 1 s, 2 s, 4 s, 8 s after consecutive failures.
> - **At the edge:** Cloudflare or the platform's own rate limiter, so the traffic never reaches
>   Python.
> - Rate-limit `/register` too, or it becomes a spam-account and DB-fill vector.

### R1.5 Weak password rules

```python
    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v
```
> `backend/app/schemas.py:27-32`

Eight characters, no other requirement. `"password"` and `"12345678"` are both accepted.

> **Fix.** Current NIST guidance (SP 800-63B) is *not* the old uppercase/number/symbol matrix —
> those rules push people toward `Password1!` and hurt more than they help. What actually works:
> - **Length ≥ 12**, and allow long passphrases (don't cap below ~64).
> - **Check against a breached-password list** — `haveibeenpwned`'s k-anonymity range API lets
>   you check without sending the password or its full hash. This is the single highest-value
>   control, because credential stuffing with known-breached passwords is the dominant attack.
> - Reject context-specific values (the user's own email, the site name).
> - Show a strength meter (`zxcvbn`) rather than blocking on character classes.
> - Offer TOTP 2FA — worth more than any password rule.
>
> Also: **bcrypt silently truncates input at 72 bytes.** Passwords longer than that have their
> tail ignored. Not exploitable, but you should either reject over-length input explicitly or
> pre-hash with SHA-256 before bcrypt. Knowing this detail signals real familiarity.

### R1.6 No account lockout

Related to rate limiting but distinct: after N consecutive failures, an account should
temporarily lock (or require a CAPTCHA / email confirmation) **regardless of source IP**. Rate
limiting stops one IP; lockout stops a distributed botnet grinding one high-value account.

> **The trade-off to name:** naive lockout is itself a DoS — I can lock *your* account by
> failing to log in as you five times. Mitigations: lock only after failures from many distinct
> IPs, use progressive delays rather than a hard lock, notify the account owner by email, and
> always let a successful password reset clear the lock.

### R1.7 No audit logging

There is **no record of who did what**. Nothing logs successful logins, failed logins, zone
creation, record deletion, or the source IP of any of it. For a DNS control plane that's a
serious gap — deleting an apex A record takes a production site offline, and today there's no
way to answer "who did this and when?"

> **Fix.** An `audit_log` table: `user_id`, `action`, `resource_type`, `resource_id`,
> `ip_address`, `user_agent`, `timestamp`, `before`/`after` JSON. Written from a FastAPI
> **middleware** or a dependency so it can't be forgotten on a new route. Ship it to
> append-only storage so an attacker who gains DB write access can't erase their tracks. Note
> that `HostedZone` and `DNSRecord` already carry `created_at`/`updated_at` (`models.py:55-56`,
> `81-82`) — so you know *when* something changed, just not *who* or *what it was before*.

### R1.8 Smaller items

| Gap | Fix |
|---|---|
| No email verification on register | Send a signed confirmation link; leave the account unverified until clicked |
| No password reset flow | Single-use, short-TTL, hashed-at-rest reset token by email |
| No 2FA | TOTP (`pyotp`) with recovery codes |
| No security headers | `HSTS`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, CSP — one middleware |
| `datetime.utcnow()` is deprecated (`auth.py:36`) | `datetime.now(timezone.utc)` — the codebase already uses the correct form at `zones.py:229` |
| Errors aren't logged | `get_current_user` swallows `JWTError` silently; a burst of invalid tokens is invisible |
| No unique constraint on `(zone_id, name, type)` | Check-then-insert can race; add the DB constraint and catch `IntegrityError` |

---

## R2. Flag, attribute and claim reference

### R2.1 Session-cookie flags (`auth.py:41-49`)

| Flag | Value | What it does |
|---|---|---|
| `httponly=True` | always | **JavaScript cannot read this cookie.** `document.cookie` doesn't show it |
| `max_age` | 86400 s | Browser deletes it after 24h — matches the JWT's own `exp` |
| `samesite` | `lax` dev / `none` prod | Controls whether the cookie rides along on cross-site requests |
| `secure` | `False` dev / `True` prod | `True` = HTTPS only, never sent over plain HTTP |

### R2.2 `SameSite` values

| `SameSite` | Behaviour |
|---|---|
| `Strict` | Never sent on any cross-site request. Safest; breaks arriving via an external link |
| `Lax` | Sent on top-level GET navigations only — **not** on cross-site POST/PUT/DELETE |
| `None` | Always sent. **Requires `Secure`**, so HTTPS only |

```
 dev:   localhost:3000 → localhost:8000     same site   → SameSite=Lax,  Secure=False
 prod:  app.vercel.app → api.onrender.com   cross-site  → SameSite=None, Secure=True
```

### R2.3 Registered JWT claims *not* used here

| Claim | Purpose | Why it would help |
|---|---|---|
| `iat` | Issued-at | Enables "invalidate all tokens issued before X" — a global logout |
| `jti` | JWT ID | A unique token ID, which is what a revocation blocklist keys on |
| `iss` / `aud` | Issuer / audience | Stops a token from one service being replayed at another |
| `nbf` | Not-before | Post-dated tokens |

---

## R3. Captured outputs

### R3.1 The login response, in full

```console
$ curl -i -X POST http://localhost:8000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"demo@route53.aws","password":"Demo1234!"}'

HTTP/1.1 200 OK
content-type: application/json
set-cookie: access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vQHJvdXRlNTMuYXdzIiwiZXhwIjoxNzg1Mzg2NjM0fQ.C2M8SognTplFaNga3yKA4quH1GEos4TWjYkdBBTmNGE; HttpOnly; Max-Age=86400; Path=/; SameSite=lax

{"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZW1vQHJvdXRlNTMuYXdzIiwiZXhwIjoxNzg1Mzg2NjM0fQ.C2M8SognTplFaNga3yKA4quH1GEos4TWjYkdBBTmNGE","token_type":"bearer"}
```

### R3.2 Cookie and Bearer, same result

```console
$ curl -b cookies.txt http://localhost:8000/api/auth/me
{"id":1,"email":"demo@route53.aws","full_name":"AWS Demo User","created_at":"2026-06-19T00:04:02"}

$ curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." http://localhost:8000/api/auth/me
{"id":1,"email":"demo@route53.aws","full_name":"AWS Demo User","created_at":"2026-06-19T00:04:02"}
```
