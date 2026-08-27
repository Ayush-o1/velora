# Engineering Decisions

Three non-trivial decisions made while building Velora, beyond what the
brief mandated outright.

---

## 1. Booking capacity concurrency strategy

**Problem.** The brief requires that a session's active bookings never
exceed its capacity, even when multiple users book at nearly the same
instant, and that this be provable, not just plausible.

**Why a frontend check is not enough.** A client reading
`seats_remaining` and disabling its own "Book" button only prevents
that one browser from *trying* to oversell — it does nothing to stop a
second browser, a second tab, or a direct `curl`/Postman request from
doing the same thing at the same time. Two requests can both read
`seats_remaining: 1` before either has written anything back, and both
proceed to book. The frontend has no way to see the other request's
in-flight write; only the database, which serializes access to the
underlying rows, can.

**Options considered.**
- **Naive check-then-insert** (`if remaining_seats > 0: create_booking()`)
  in the view/service. Rejected outright — this is exactly the
  read-then-write race the brief warns against; two concurrent requests
  can both pass the check before either commits.
- **Optimistic concurrency** (a `version` column on `Session`, updated
  with a conditional `UPDATE ... WHERE version = :expected`, retrying
  on conflict). Correct, but adds a retry loop and a version column to
  reason about for a capacity check that isn't expected to be
  contended at high volume in this scope — harder to explain simply in
  an interview for no real benefit here.
- **`select_for_update()` pessimistic locking** on the `Session` row
  inside `transaction.atomic()`, combined with a partial unique DB
  constraint for the separate duplicate-booking invariant. Chosen.

**Why this is safe.** `select_for_update()` takes a row lock on the
target `Session` for the transaction's duration. If two requests race
to book the same session, the second blocks at `SELECT ... FOR UPDATE`
until the first's transaction commits or rolls back — it can only
proceed once the first booking is already durably counted, so it
re-reads the active-booking count *after* that write is visible. This
closes the exact race window a naive check has. See the extended
rationale and the `select_for_update()` call site in
[`backend/apps/bookings/services.py`](backend/apps/bookings/services.py).

**Two invariants, two enforcement layers, on purpose:**
- *Capacity* (`active_bookings(session) <= capacity`) is an aggregate
  over sibling rows — no single-row `CHECK` constraint can express it,
  so it's enforced procedurally via the lock above.
- *Duplicate active booking* (one user, one session) **is** a
  single-row fact, so it is additionally enforced by a database-level
  partial unique index —
  `unique_active_booking_per_user_session` on `Booking`, `WHERE status
  = 'active'` (see
  [`backend/apps/bookings/models.py`](backend/apps/bookings/models.py)).
  This is kept even though the session-row lock already serializes
  same-session requests, as defense in depth: it protects the
  invariant unconditionally, independent of whether every call site
  remembers to take the lock.

**Trade-off.** `select_for_update()` serializes *all* booking attempts
on a given session, even ones that would obviously both succeed (e.g.
capacity 500, two people booking at once). For this assignment's scale
that's the right trade: correctness is simple to state and verify, and
the lock is held only for the few milliseconds of a booking write, not
for anything user-facing. At marketplace scale with heavy contention
on a single popular session, this would become a throughput bottleneck
and the optimistic/counter-column approach would be worth revisiting.

**Verification, not just assertion.** A concurrency test
(`backend/apps/bookings/tests/test_concurrency.py`) fires 12 real
concurrent HTTP requests (separate threads, separate DB connections,
synchronized with a `Barrier`) at a capacity-1 session and asserts
exactly one succeeds. To confirm the test itself was meaningful rather
than vacuously passing, I temporarily removed `select_for_update()`
and reran it: all 12 requests succeeded, oversubscribing the session
12x. Restoring the lock and rerunning brought it back to exactly 1.
This is recorded in the commit history and in
[DEBUGGING.md](DEBUGGING.md).

---

## 2. Auth token architecture: where each token lives, and why

**Problem.** The brief mandates JWT access/refresh tokens issued by the
backend, but not how the frontend should hold onto them — that's an
open design question with real security trade-offs (XSS vs. CSRF
exposure) and real UX trade-offs (does a page refresh log you out?).

**Options considered.**
- **Both tokens in `localStorage`.** Simplest to implement, but any
  successful XSS on the frontend can read `localStorage` directly and
  exfiltrate a long-lived refresh token, not just the short-lived
  access token. Rejected for that exposure.
- **Both tokens as httpOnly cookies**, letting the browser attach them
  automatically. Removes the XSS-read risk but reintroduces CSRF
  concerns for state-changing requests and couples the API to
  cookie-based auth even for non-browser clients. More machinery than
  this scope needs.
- **Access token in memory only (React state, never persisted);
  refresh token as an httpOnly, `SameSite=Lax` cookie, scoped to
  `/api/auth/`.** Chosen.

**Why this is the right split.** The access token is short-lived (15
minutes) and only ever needs to exist for the life of a tab, so keeping
it in memory means an XSS payload that runs *can* steal the current
access token (a real but time-boxed exposure) but cannot read a
long-lived credential from storage — there's nothing durable to steal
between page loads. The refresh token is the credential that actually
matters over time, so it's the one made unreadable to JavaScript
(httpOnly) and only ever sent to the one path that needs it
(`path=/api/auth/`). `SameSite=Lax` (rather than `None`) means it isn't
attached to cross-site requests at all, which covers CSRF for this
cookie without needing a separate CSRF token scheme, at the cost of
not working if the frontend and backend were ever on genuinely
different sites — which leads directly to decision #3 below.

**Trade-off.** Keeping the access token in memory means a hard page
reload always has to pay one round trip to `/api/auth/refresh/` before
the user shows as logged in (a brief "loading" flash on first paint),
rather than being instantly available from storage. That's the correct
trade for this brief: the assignment's threat model (authorization
bypass, crafted requests) cares more about token exposure than about
shaving one network round trip off a page load.

---

## 3. Same-origin delivery via Nginx, not CORS

**Problem.** The brief requires Nginx as a reverse proxy in front of
frontend and backend. Given that requirement, the frontend could still
either call the backend as a separate origin (`api.example.com`) with
CORS configured, or be served through Nginx such that the API is
same-origin from the browser's point of view. This shapes how the
refresh cookie above can behave.

**Options considered.**
- **Separate origins + CORS**, with `Access-Control-Allow-Credentials`
  and an explicit allow-list. Works, but then the refresh cookie from
  decision #2 needs `SameSite=None; Secure`, which requires HTTPS even
  for local evaluation, and every request pays a CORS preflight.
- **Nginx path-based routing** (`/api/*` → backend, everything else →
  the Next.js server) so the browser sees one origin for both the app
  and the API. Chosen — implemented in
  [`nginx/nginx.conf`](nginx/nginx.conf).

**Why this is safe and simpler.** With one origin, the refresh cookie
is a garden-variety same-site cookie — no CORS credential dance, no
preflight overhead, and `SameSite=Lax` is sufficient rather than
`None`. It also means the exact same frontend build works identically
in `docker compose` (through Nginx on `:3000`) and in local `next dev`
against the Django dev server directly — the only variable is whether
`NEXT_PUBLIC_API_URL` is empty (same-origin) or points at `:8000`. This
is also why the single GitHub OAuth callback URL
(`http://localhost:3000/auth/callback`) works unchanged in both modes,
instead of needing two registered OAuth apps.

**Trade-off.** All frontend traffic now flows through the same Nginx
process as the API, so a misbehaving upstream (either container) shows
up as a Nginx-proxied error rather than a distinctly different failure
mode — acceptable for a single reverse proxy fronting two services at
this scale, but worth knowing if the two were ever split onto
different hosts.
