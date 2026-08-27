# Velora

A compact sessions marketplace: creators host live sessions, users
browse and book them. Built as a full-stack candidate assignment —
correctness and defensible engineering decisions over visual polish.

- **Backend:** Django 5 + Django REST Framework, PostgreSQL 16
- **Frontend:** Next.js 16 (App Router, client-side, TypeScript, Tailwind)
- **Auth:** GitHub OAuth → backend-issued JWT access/refresh tokens
- **Infra:** Docker Compose (Nginx + frontend + backend + Postgres)

See also: [DECISIONS.md](DECISIONS.md) (non-trivial engineering
choices), [DEBUGGING.md](DEBUGGING.md) (real bugs found and fixed),
[PROMPT_LOG.md](PROMPT_LOG.md) (how AI was used on this project).

---

## Architecture

```
                     ┌────────────────────────┐
   browser  ───────► │   Nginx  (:3000)        │
                     │  /api,/admin,/static ───┼──► backend  (Django+DRF, :8000)
                     │  everything else    ────┼──► frontend (Next.js,  :3000)
                     └────────────────────────┘
                                                        backend ──► db (Postgres, named volume)
```

Nginx is the single entrypoint the browser talks to, so frontend and
API share one origin — no CORS, and the refresh-token cookie can be a
plain `SameSite=Lax` cookie (see [DECISIONS.md](DECISIONS.md) for why).

**Backend apps** (`backend/apps/`):
- `accounts` — custom `User` model (`role: user|creator`), GitHub OAuth
  exchange, JWT issuance/refresh/logout, profile.
- `catalog` — `Session` model, public read + creator-owned CRUD.
- `bookings` — `Booking` model, the capacity-safe booking service, and
  the concurrency proof (`prove_concurrency` management command).
- `core` — health check, shared permissions, uniform API error envelope.

**Frontend** (`frontend/src/`): catalog, session detail + booking,
login + OAuth callback, profile, booking history, creator dashboard +
session CRUD forms. `src/lib/auth-context.tsx` and `api-client.ts` hold
the auth/token machinery; every other page is a thin consumer of it.

---

## Setup

### Prerequisites

- Docker + Docker Compose
- A GitHub account (to register an OAuth App — see below)

### 1. Environment

```bash
cp .env.example .env
```

Fill in `DJANGO_SECRET_KEY` (any long random string —
`python -c "import secrets; print(secrets.token_urlsafe(50))"` works),
a `POSTGRES_PASSWORD`, and the GitHub OAuth values below.

### 2. GitHub OAuth App

Create one at **github.com → Settings → Developer settings → OAuth
Apps → New OAuth App**:

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/auth/callback`

Put the generated Client ID / Secret into `.env` as `GITHUB_CLIENT_ID` /
`GITHUB_CLIENT_SECRET`. The client ID is also read at frontend build
time to construct GitHub's authorize URL (it's public by design — only
the secret is sensitive, and it never leaves the backend).

### 3. Run

```bash
docker compose up --build
```

Then open **http://localhost:3000**. Django admin is at
`/admin/` (create a superuser with
`docker compose exec backend python manage.py createsuperuser` if you
want to browse the data directly).

---

## How authentication works

1. Frontend redirects to GitHub's OAuth authorize URL with a random
   `state` value stashed in `sessionStorage` (CSRF protection).
2. GitHub redirects back to `/auth/callback?code=...&state=...` (or
   `?error=...` if the user cancelled/denied — see below).
3. Frontend verifies `state` matches, then POSTs `code` to
   `/api/auth/github/callback/`.
4. Backend exchanges the code for a GitHub access token **server-side**
   (the client secret never reaches the browser), fetches the GitHub
   profile + verified email, and get-or-creates a `User`.
5. Backend returns a short-lived JWT **access token** in the response
   body and sets the **refresh token** as an httpOnly, `SameSite=Lax`
   cookie scoped to `/api/auth/`.
6. The frontend keeps the access token in memory only (never
   `localStorage`) and attaches it as `Authorization: Bearer <token>`.
   On any 401, or on a fresh page load, it silently calls
   `/api/auth/refresh/` (cookie-based) for a new access token before
   giving up and treating the user as logged out.

**Error cases handled:**
- **Expired/invalid access token** → `401` with `{"error": {"code":
  "token_not_valid", ...}}`; the frontend retries once through a
  silent refresh, then clears auth state if that also fails.
- **OAuth cancellation/denial** (`?error=access_denied` from GitHub) or
  a failed code exchange (expired code, GitHub unreachable) → the
  callback page shows a plain-language message and a link back to
  `/login`, never a crash or a raw error dump.
- **User calling a creator-only endpoint** → `403` from a real DRF
  permission class (`IsCreator` / `IsSessionOwnerOrReadOnly`), not a
  hidden frontend button. See `backend/apps/core/permissions.py`.
- **Creator editing another creator's session** → `403`, enforced by an
  **object-level** permission check (`obj.creator_id ==
  request.user.id`), so a crafted request against someone else's
  session id is rejected server-side regardless of what the frontend
  would show.

### Roles

`User.role` is `"user"` or `"creator"`. There's no separate
creator-application flow in this brief, so becoming a creator is a
self-service profile update (`PATCH /api/auth/me/ {"role": "creator"}`,
exposed as a "Become a creator" button on the profile page). This only
ever grants the ability to manage your *own* sessions — it's not a
path to `is_staff`/`is_superuser`, which aren't exposed by that
endpoint at all.

---

## Session & booking flow

- **Public:** catalog (`GET /api/sessions/`) and session detail
  (`GET /api/sessions/:id/`) — no auth required.
- **Creator:** create/update/delete their own sessions
  (`POST`/`PATCH`/`DELETE /api/sessions/:id/`), and view their own
  sessions with live booking counts (`GET /api/sessions/mine/`).
- **User:** book a session (`POST /api/bookings/`), view active/past
  bookings (`GET /api/bookings/me/?scope=active|past`), cancel an
  active booking (`DELETE /api/bookings/:id/`, which frees the seat).

## Booking concurrency strategy

**The invariant:** a session's active bookings can never exceed its
capacity, even under real concurrent requests. Full reasoning and the
rejected alternatives are in [DECISIONS.md](DECISIONS.md); summary:

- `select_for_update()` locks the `Session` row inside
  `transaction.atomic()` while `create_booking()` counts active
  bookings and decides whether there's a free seat — a second
  concurrent request on the same session blocks until the first
  transaction commits, so it always sees the up-to-date count.
- A **partial unique DB constraint**
  (`unique_active_booking_per_user_session`) independently prevents the
  same user from holding two active bookings for the same session, as
  defense in depth.
- Booking a session whose `start_time` has already passed is rejected.

**Proof, not assertion:**
- `backend/apps/bookings/tests/test_concurrency.py` fires 12 real
  concurrent HTTP requests (real threads, real DB connections,
  synchronized with a `Barrier`) at a capacity-1 session and asserts
  exactly one succeeds — plus a capacity-3 variant, a same-user
  double-submit variant, and 5 repeated trials to catch flakiness.
  **This test was verified to actually catch the bug**: temporarily
  removing `select_for_update()` made all 12 requests succeed
  (oversubscribing a 1-seat session 12×); restoring it brought it back
  to exactly 1. See DEBUGGING.md/DECISIONS.md for that experiment.
- `python manage.py prove_concurrency [--contenders N]` is a standalone,
  test-suite-independent reproduction of the same race, runnable
  directly:
  ```bash
  docker compose exec backend python manage.py prove_concurrency --contenders 15
  ```
  This was also run against the live Docker deployment via real HTTP
  requests through Nginx (10 concurrent `curl` requests at a
  capacity-1 session): exactly 1 `201`, 9 `409 session_full`.

---

## Tests

```bash
cd backend
source .venv/bin/activate   # or: pip install -r requirements.txt into your own venv
python manage.py test       # or: pytest
```

Or inside Docker: `docker compose exec backend python manage.py test`.

**36 backend tests**, covering:
- Auth: missing/invalid/expired token → 401; profile update; role
  self-service; invalid role value rejected.
- Catalog: public read without auth; creator-only create (403 for a
  plain user); cross-creator edit/delete rejection (403); `mine` with
  live booking counts.
- Bookings: success, duplicate-booking rejection, full-session
  rejection, already-started rejection, cancel-then-rebook, cancel
  frees a seat for someone else, cannot cancel another user's booking.
- **Concurrency:** the race tests described above.

Frontend: `cd frontend && npx eslint . && npx tsc --noEmit && npm run
build` — all pass clean. UI flows (catalog, login, booking, seat-count
updates, creator dashboard, role-gated redirects) were also verified by
driving the real running app with a headless browser against the real
backend + Postgres, not just typechecked.

---

## Database persistence

Postgres data lives in a named Docker volume (`postgres_data`), which
is independent of the container lifecycle. Verified directly: created
data, ran `docker compose restart backend db` (data intact), then a
full `docker compose down` + `up` (containers recreated, volume
untouched, data still intact). Data is only lost with an explicit
`docker compose down -v`.

---

## Known limitations

- No password/email login — GitHub OAuth only, per the brief's choice
  of provider. Losing GitHub access means losing account access.
- No rate limiting on booking/auth endpoints. Not required by the
  brief; would matter before any real deployment.
- No automated end-to-end (Playwright-in-CI) test suite — UI
  correctness was verified manually with a headless browser during
  development, but that verification isn't wired into a repeatable
  test target yet.
- Session capacity/time can't be edited down below existing active
  bookings without an explicit conflict check — a creator could set
  `capacity` below the current booking count via `PATCH`, which the API
  doesn't currently reject (a booking can never be *created* past
  capacity, but a creator can't accidentally be prevented from
  right-sizing a listing after the fact either, since it's a
  legitimate edit and the assignment doesn't specify a required
  behavior here).
- Single Nginx origin means frontend and backend availability are
  coupled behind one proxy; fine at this scale, worth revisiting if
  they were ever split across hosts.

## What I'd improve with another day

- Rate limiting (DRF throttling) on auth and booking endpoints.
- An email/notification hook on successful booking and on a creator
  cancelling a session out from under existing bookings.
- Pagination/infinite-scroll polish on the catalog and a search/filter
  by date or creator.
- A CI workflow running the backend test suite and frontend
  lint/typecheck/build on every push.
- Explicit handling for a creator lowering `capacity` below the current
  active-booking count (surface a warning rather than silently allowing
  it).
