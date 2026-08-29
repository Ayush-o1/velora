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

---

## 4. Visual identity: a deliberate typography + color system, not a default template

**Problem.** The brief explicitly asked for a frontend that reads as
"designed for Velora," not as a default Tailwind/shadcn-style admin
template — blue-or-purple gradient SaaS, or black-and-neon "tech,"
being the two most common defaults. That's a real design decision with
trade-offs, not just "make it look nice."

**Options considered.**
- **A default component-library look** (Inter everywhere, blue accent,
  `rounded-xl` cards, soft drop shadows) — fast to build, immediately
  recognizable as "generic AI-generated dashboard," and the brief
  explicitly asked to avoid exactly this.
- **A dark, "premium tech" theme** (near-black background, a single
  saturated accent, heavy glow/shadow) — currently the other extremely
  common default; risks reading as generic in the opposite direction
  (crypto/dev-tool coded) rather than as calm and human, which is the
  brand personality the product actually wants (a marketplace for
  people teaching people, not a trading terminal).
- **A warm, editorial system**: a serif display face (Fraunces) carrying
  all headline personality, paired with a quiet sans (Inter) that only
  ever does UI/body text; a warm paper background with a single
  restrained pine-green accent instead of blue/purple. Chosen.

**Why this is the right split.** The most common tell of an
AI-generated interface isn't any single color or font — it's Inter (or
a similar geometric sans) carrying *everything*, including huge display
headlines, with no other typographic voice. Giving headlines a distinct
serif face with real character, and keeping the sans strictly to
UI/body text, is what makes the two `<h1>`s on the catalog and session
detail pages read as "a considered product" rather than "a
component-library default" — even though Inter itself is a perfectly
ordinary, safe choice for body copy.

**Trade-off, and a mistake this caught.** A distinctive palette means
every color pairing has to be checked for contrast by hand rather than
inherited from a library that's already done it — and one pairing
didn't clear WCAG AA on the first pass: `--color-muted` (used for card
metadata at 13px) measured ~3.5:1 against the background, below the
4.5:1 minimum for normal-sized text. Caught by actually computing
contrast ratios for the palette rather than eyeballing it, and darkened
to ~5.3:1. See DEBUGGING.md #8.

---

## 5. Native `<dialog>` instead of a modal library

**Problem.** The creator dashboard's delete-session flow used a native
`window.confirm()` — functional, but it looks like a browser default,
not part of the product, and it's the kind of "obviously unfinished"
detail the brief specifically called out to fix.

**Options considered.**
- **A headless UI library** (Radix Dialog, Headless UI) for proper
  focus-trapping and accessibility. The standard choice, but it's a new
  dependency for something the platform can now do natively, on a
  project that currently has zero UI dependencies beyond Next/React
  itself.
- **A hand-rolled `<div>`-based modal** with manual focus trapping,
  `Escape` handling, and scroll-locking. Correct if done carefully, but
  reimplementing genuinely fiddly accessibility behavior (focus trap
  edge cases, restoring focus to the trigger on close) from scratch is
  exactly the kind of "hand-rolled a11y bug waiting to happen" this
  project has otherwise tried to avoid.
- **The native `<dialog>` element** with `.showModal()`. Chosen.

**Why this is the right choice here.** `<dialog>` gives focus trapping,
`Escape`-to-close, a real top-layer stacking context, and automatic
focus restoration to whatever triggered it, for free, in every evergreen
browser — no dependency, no hand-rolled focus-trap logic to get subtly
wrong. `::backdrop` styling covers the scrim; click-outside-to-close is
the one behavior it doesn't provide natively and needed a few lines
(checking `event.target === dialogRef.current`).

**Trade-off.** Less animation/transition control than a library offers
(entrance/exit choreography on `<dialog>` is still a rougher edge of
the platform than a library's), and no built-in portal management —
acceptable for a single confirmation dialog in this scope; would be
worth revisiting if the product grew several different dialog types
with more elaborate motion.

---

## 6. Where each invariant is enforced, and why the layers differ

Velora has three rules that must never be broken. They are enforced in
three different places, and the difference is deliberate rather than
accidental.

| Invariant | Enforced by | Why there |
| --- | --- | --- |
| Active bookings ≤ capacity | `select_for_update()` on the Session row inside `transaction.atomic()` | It's an aggregate over sibling rows. A `CHECK` constraint can only see one row, and Postgres has no way to say "count these and stop at N" without something serialising access to the set. |
| One active booking per user per session | Partial unique index on `Booking` (`unique_active_booking_per_user_session`) | It *is* a single-row fact, so the database can hold it unconditionally — independently of whether every future code path remembers to take the lock. |
| Capacity ≥ existing bookings | Serializer validation on `Session` write | It's a decision about a *change* rather than a fact about a row: the same capacity value is legal or illegal depending on what's already booked. Expressing it as a constraint would mean a trigger; expressing it as validation gives the creator a sentence explaining why. |

The pattern: put a rule in the database when the database can state it
in one row, and in a transaction when it can't. Only put it in
application-level validation when the rule is about an *edit*, not
about a state.

**Why the frontend is never the answer.** Every one of these is also
reflected in the UI — a disabled button, a hidden action, a warning.
None of that is enforcement. The booking page tells a creator "you're
hosting this session, so there's no seat to book", and before this was
fixed a plain `POST /api/bookings/` walked straight past that sentence
and gave the host a seat. The UI's job is to explain the rule; the
server's job is to hold it. The audit that found that hole is written
up in [DEBUGGING.md](DEBUGGING.md).

---

## 7. What the landing page is allowed to claim

Velora is a portfolio-scale product with no users, no traction and no
testimonials. The temptation on a landing page is to borrow the shape
of a real company's — logos, counts, quotes — because that shape is
what looks finished.

Everything on `/` is instead a literal description of behaviour the
code actually has, and each claim maps to a test:

| Claim on the page | What backs it |
| --- | --- |
| "exactly one of you gets it — decided in the database" | `test_capacity_one_never_oversells_under_concurrent_requests` |
| "another creator can't touch your listing even with the right URL" | `test_creator_cannot_edit_another_creators_session` |
| "Lowering it below the people already booked is refused" | `test_capacity_cannot_be_lowered_below_active_bookings` |
| "Cancel any time before the session starts and the seat goes straight back" | `test_cancel_booking_frees_a_seat_for_someone_else` |

The "Happening soon" section reads the real catalog rather than showing
placeholder cards, and hides itself entirely if the API can't be
reached — a shopfront shouldn't hand a first-time visitor an error
banner. The hero's seat grid is ornament and deliberately states no
number, because a number there would be a claim.

The reasoning is simple: an invented statistic is the one thing on the
page that can be checked and found false in ten seconds, and it would
put every honest claim next to it in doubt.

---

## 8. The logo mark: seats, not an icon

**Problem.** Velora had no real logo — just the wordmark "Velora" set in italic Fraunces. That's fine as a wordmark, but it doesn't give you anything to put in a 16px favicon tab, and a text-only "logo" is one of the things that makes a project read as unfinished.

**Options considered.**
- **A generic icon** (calendar, ticket, sparkle) next to the wordmark. Rejected — arbitrary, no connection to what the product actually does, and a sparkle icon specifically reads as generic AI-tool branding at this point.
- **An abstract monogram** built from the letter V. Decorative, but means nothing.
- **A small grid of four seats, one filled in.** Chosen. This is the same shape as the decorative seat grid already used on the landing page hero — so the mark and the page's own visual language are the same thing, not two unrelated pieces of design.

**Why this is the right mark.** It's tied directly to what the product does — you book one of the seats — rather than being decoration. It holds up at favicon size (checked by rendering it at 16px and 32px before shipping it). The filled seat is fixed to the brand accent color regardless of surrounding text color, so it reads the same way in the nav, the footer, and the login page.

**Trade-off.** It's a geometric mark, not a lettermark, so it doesn't carry the kind of instant "V for Velora" recognition a monogram would. Traded for something that actually means something and is harder to mistake for a stock icon.

## 9. Public deployment: Render's Dockerfile builds, not a parallel config

**Problem.** The Docker Compose setup is the required submission, but it can't be opened from a link — you have to clone the repo and run it. A public demo needed hosting, without maintaining two different descriptions of how the backend builds and starts.

**Options considered.**
- **Render's native Python runtime** (buildpack-style, no Dockerfile). Rejected — it means writing a second build/start recipe that has to be kept in sync with `backend/Dockerfile` by hand, and the two would drift the first time either one changes.
- **A managed Postgres add-on from a different provider than the app host**, to shop for the cheapest free tier. Rejected as unnecessary complexity for a demo — one more account, one more set of credentials, one more thing that can silently expire without being noticed.
- **Point Render's Docker runtime straight at `backend/Dockerfile`.** Chosen. The exact image that runs in Docker Compose locally is what runs in production — same collectstatic step, same gunicorn entrypoint, same dependency versions. One Dockerfile, two places it runs.

**Why this is the right call.** Render's own free Postgres, wired into the web service via `render.yaml`'s `fromDatabase`, keeps everything in one platform and one dashboard for a demo deployment that doesn't need to be enterprise-grade — it needs to be honest about what it is. Vercel hosts the frontend because it's Next.js's own platform; no Dockerfile involved there at all.

**Trade-off.** Render's free Postgres expires 30 days after creation. For a long-lived production service that would be disqualifying; for a demo whose purpose is "can be opened and clicked through," it's an acceptable, clearly documented limitation (see [DEPLOYMENT.md](DEPLOYMENT.md)) rather than a hidden one.

## 10. Filtering sessions by creator: a backend query param, not a client-side workaround

**Problem.** The session detail page needed to show other upcoming sessions from the same host — both a real discovery feature and the fix for a layout defect (see [DEBUGGING.md](DEBUGGING.md) #19e). There was no existing way to ask the API for "sessions by this creator" other than `?search=<username>`, which also matches the username appearing incidentally in a title, description, or location.

**Options considered.**
- **Reuse `?search=<username>`.** Works today, but is matching on a coincidence (the search field happening to contain the right substring), not on identity. A creator named "max" would pull in any session mentioning "max" in its description.
- **Fetch everything and filter by `creator.id` in the browser.** No backend change at all, but means downloading every upcoming session just to keep three, and it stops being correct the moment the catalog is larger than one page — which the catalog already is not, elsewhere in this app (see the pagination limitation in the README), so repeating that same shortcut here would have compounded an existing, already-acknowledged gap instead of just leaving it alone.
- **Add a real `?creator=<id>` filter to `GET /api/sessions/`.** Chosen. Three lines in `get_queryset`, filtering on the actual foreign key, with its own test.

**Why this is the right call.** It answers the actual question ("sessions by this specific creator") instead of a proxy for it, doesn't shift a data-correctness problem onto the frontend, and cost about as much to build correctly as it would have to build as a workaround.

**Trade-off.** None significant — this is the kind of change where the "right" and "fast" answers were the same size.
