# Deployment

The required submission is the Docker Compose stack described in the [README](README.md#docker). This document covers an *additional*, optional public deployment — same code, hosted so it can be opened from a link instead of cloned. It does not replace or change the local setup.

**Status: not deployed yet.** Everything below that can be done without a browser and a set of new accounts has been — env vars traced from the actual code, `render.yaml` written and committed, config double-checked for cross-origin auth. What's left is genuinely manual: creating a Render account, a Vercel account, and a second GitHub OAuth App for the production callback URL. There's no API for any of those three that doesn't involve a human clicking through a consent screen.

## Why Vercel + Render

Checked against both platforms' current docs (not third-party pricing summaries) before committing to this:

- **Vercel** is Next.js's own hosting platform — zero-config builds, no Dockerfile needed for the frontend. The Hobby plan is free and requires no card, restricted to non-commercial use, which a portfolio/hiring-assignment demo satisfies.
- **Render** runs the backend from the *existing* `backend/Dockerfile` directly — no second build definition to keep in sync with Docker Compose. Free web services get 750 instance-hours/month and sleep after 15 minutes idle (~1 minute cold start on the next request). Free Postgres is real Postgres, not a toy — but it's genuinely temporary: **1GB, expires 30 days after creation, with a 14-day grace period before deletion.** That's acceptable for a demo database that exists to be looked at, not relied on — but it does mean the data will need recreating periodically, which is documented here rather than discovered later.

## Architecture

```
Browser
  │  HTTPS
  ▼
Vercel  (Next.js — frontend only)
  │  HTTPS, credentialed fetch
  ▼
Render  (Django + DRF, gunicorn, the same Docker image used locally)
  │  internal connection
  ▼
Render PostgreSQL  (free tier, isolated from local dev data)

GitHub OAuth → production callback (Vercel URL) → Render → JWT → Vercel
```

This is a different topology from local, where Nginx puts the frontend and backend on the same origin. Here they're genuinely cross-origin (`*.vercel.app` calling `*.onrender.com`), which is the one thing that needed real thought rather than copy-pasted config — see [Cross-origin auth](#cross-origin-auth) below.

## Environment variables

Traced from the code that actually reads them (`backend/velora/settings.py`, `frontend/src/lib/config.ts`), not guessed.

### Render (backend) — set in the Render dashboard, never in this repo

| Variable | Value | Notes |
|---|---|---|
| `DJANGO_SECRET_KEY` | auto-generated | `render.yaml` sets `generateValue: true` |
| `DEBUG` | `False` | fixed in `render.yaml` |
| `ENABLE_HTTPS` | `True` | flips on HSTS, secure cookies, SSL redirect together — see `settings.py` |
| `WEB_CONCURRENCY` | `2` | gunicorn workers; free plan caps the container at 512MB, see [below](#one-real-fix-this-surfaced) |
| `DJANGO_ALLOWED_HOSTS` | the Render-assigned hostname | not known until first deploy |
| `CORS_ALLOWED_ORIGINS` | the Vercel URL, exact | never a wildcard |
| `FRONTEND_URL` | the Vercel URL | used for links back to the app (e.g. OAuth error redirects) |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | from the **production** GitHub OAuth App | a separate app from the one used locally — see below |
| `GITHUB_OAUTH_REDIRECT_URI` | `https://<vercel-url>/auth/callback` | must match the OAuth App's callback URL exactly |
| `REFRESH_COOKIE_SECURE` | `True` | required for `SameSite=None` to be accepted by browsers |
| `REFRESH_COOKIE_SAMESITE` | `None` | see [Cross-origin auth](#cross-origin-auth) |
| `POSTGRES_DB/USER/PASSWORD/HOST/PORT` | wired via `fromDatabase` in `render.yaml` | points at the Render Postgres instance, not local dev data |

### Vercel (frontend) — only frontend-safe values, `NEXT_PUBLIC_*` is public by definition

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | the Render backend URL |
| `NEXT_PUBLIC_GITHUB_CLIENT_ID` | the production OAuth App's client ID (public — this is normal for OAuth) |
| `NEXT_PUBLIC_GITHUB_OAUTH_REDIRECT_URI` | `https://<vercel-url>/auth/callback` |

`NEXT_PUBLIC_*` values are baked into the JS bundle at build time, not read at runtime — confirmed directly by grepping a local production build's output (`.next/static`) and finding `NEXT_PUBLIC_API_URL` compiled in as a literal string. **They must be set in Vercel before the first build**, not after — changing one later requires a redeploy, not just a settings save. The client secret and Django secret key never go here; only the client *ID* is public.

## Cross-origin auth

Locally, Nginx puts the frontend and backend on the same origin, so the refresh cookie is a normal same-site cookie (`SameSite=Lax`) and CORS is moot. Vercel and Render are different origins, so two things change:

- The refresh cookie needs `SameSite=None; Secure` — without it, browsers won't send it back on cross-origin API calls at all, and every silent session refresh would fail. Both are already environment-driven flags in `settings.py` (`REFRESH_COOKIE_SAMESITE`, `REFRESH_COOKIE_SECURE`); this needed configuration, not code changes.
- `CORS_ALLOWED_ORIGINS` must list the exact Vercel URL. `CORS_ALLOW_CREDENTIALS = True` is already set — required for the browser to attach the cookie to a cross-origin fetch at all.

One thing that turned out **not** to need special handling: CSRF. Django's `CsrfViewMiddleware` is active, but DRF's `APIView.as_view()` wraps every view in `csrf_exempt` and only re-enforces it for `SessionAuthentication` — this project's `DEFAULT_AUTHENTICATION_CLASSES` is JWT-only, so CSRF checking never applies to any of these endpoints, cross-origin or not. No `CSRF_TRUSTED_ORIGINS` needed. Confirmed by reading `REST_FRAMEWORK` in `settings.py` and DRF's own `views.py`, not assumed.

## One real fix this surfaced

Auditing the production config for the free tier's 512MB container limit, the running local container was measured at **213MB idle with gunicorn's 3 workers** — comfortable on a dev machine, uncomfortably close to the ceiling under real request load on a free-tier instance. `backend/Dockerfile`'s worker count is now read from `WEB_CONCURRENCY` (`--workers ${WEB_CONCURRENCY:-3}`), defaulting to 3 so Docker Compose is unaffected, with `render.yaml` overriding it to 2 for the free-tier deploy specifically.

## Deploy steps (manual — this is the part that needs a human)

1. **Render** → sign up, no card required → New → Blueprint → connect this repo → it reads `render.yaml` and offers to create `velora-backend` + `velora-db`. On first deploy it prompts for the `sync: false` variables (`DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`, the three `GITHUB_*` values) — placeholder values are fine for this first pass, they get corrected in step 4. Note the assigned URL.
2. **Vercel** → sign up → New Project → import this repo → set **Root Directory** to `frontend` → set `NEXT_PUBLIC_API_URL` to the Render URL from step 1 → deploy. Note the assigned URL.
3. **GitHub OAuth App** (github.com/settings/developers → New OAuth App, separate from any local-dev app) → Homepage URL = the Vercel URL → Authorization callback URL = `<vercel-url>/auth/callback` exactly.
4. Update the Render and Vercel env vars listed above with the real values from steps 1–3, redeploy both.
5. Verify: sign in with GitHub against the live URL, book a session, cancel it, sign out. Confirm no `localhost` appears anywhere in the deployed frontend's network requests.

## Known limitations of this deployment specifically

- Free Postgres expires 30 days after creation (14-day grace period after that). This is a disposable demo database, not a durable one — if it's gone, the fix is recreating it via the same Blueprint, not an incident.
- Free web service sleeps after 15 minutes idle; the first request after a quiet period takes about a minute while it wakes up. Real, not a bug.
- A true concurrent-booking proof (the same test the Docker/Postgres setup runs) is unreliable against a service that can be mid-cold-start — the authoritative concurrency evidence remains the local Docker test documented in the [README](README.md#booking-correctness) and the [verification report](docs/VELORA_FINAL_VERIFICATION_REPORT.pdf), not whatever the live demo happens to return at a given moment.
