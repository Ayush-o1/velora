# Debugging Log

Real issues found and fixed while building Velora, surfaced by the
project's own test suite and lint tooling — not invented after the
fact. Each was caught during the "implement → test → inspect → fix →
re-test" loop before being committed.

Issues 1–3 were found while building the feature set. Issues 4–6 were
found during a later, deliberately adversarial audit pass over the
already-"complete" codebase — a second pass that assumed nothing and
re-verified everything, rather than trusting the first pass's report.
Issues 7–8 were found during a subsequent frontend redesign pass, while
actually driving the rebuilt UI with a real, authenticated browser
session rather than only checking it compiled. Issue 9 was found during
a final architecture/documentation pass, by actually rendering a
diagram rather than proofreading its source. Issue 10 was found during
the final OAuth-configuration verification pass, by checking test
coverage against the real code paths rather than trusting a green test
run.

---

## 1. Creating a session crashed with `KeyError: 'id'`

**Symptom.** `test_creator_can_create_session` failed with a 500 and a
traceback ending in `KeyError: 'id'` inside `SessionViewSet.create`,
even though the session was actually being written to the database
successfully.

**Diagnosis.** `SessionViewSet.create()` called `super().create(...)`
(DRF's default `CreateModelMixin.create`), then tried to re-fetch the
new row using `response.data["id"]` to attach the annotated
`seats_taken`/`seats_remaining` fields before returning:

```python
def create(self, request, *args, **kwargs):
    response = super().create(request, *args, **kwargs)
    instance = Session.objects.annotate(...).get(pk=response.data["id"])
    ...
```

**Root cause.** The view's `get_serializer_class()` returns
`SessionWriteSerializer` for `create`, and that serializer's `Meta.fields`
deliberately excludes `id` (and every other read-only/computed field) —
it's a *write* serializer, only listing the fields a creator is allowed
to submit. So `super().create()`'s response body never contained an
`id` key in the first place; the bug was assuming the write serializer's
output shape matched the read serializer's.

**Fix.** Rewrote `create()` and `update()` to not depend on the write
serializer's response shape at all: validate and save with the write
serializer, then re-fetch the instance by `serializer.instance.pk` (a
value the ORM object always has after `.save()`, regardless of which
fields the serializer exposes) and re-serialize with the read
serializer for the response. See
[`backend/apps/catalog/views.py`](backend/apps/catalog/views.py).

**Verification.** Re-ran the full suite; `test_creator_can_create_session`
and the rest of `apps/catalog/tests.py` passed. This is also what
surfaced a second, smaller issue in the same file — `get_queryset()`
triggered a `UnorderedObjectListWarning` from DRF's paginator on the
annotated queryset, fixed by making the ordering explicit
(`.order_by("start_time")`) rather than relying on it being inherited
implicitly through the annotation.

---

## 2. The expired-token test passed a token that wasn't actually expired

**Symptom.** `test_expired_token_is_rejected` asserted a 401 but got a
200 — the "expired" token was still being accepted as valid.

**Diagnosis.** The test tried to mint an expired token like this:

```python
with override_settings(SIMPLE_JWT={**SIMPLE_JWT, "ACCESS_TOKEN_LIFETIME": timedelta(seconds=-1)}):
    token = AccessToken.for_user(plain_user)
```

The assumption was that `override_settings` changing
`ACCESS_TOKEN_LIFETIME` would make a token minted inside the `with`
block expire immediately.

**Root cause.** `rest_framework_simplejwt`'s `AccessToken` class binds
`lifetime = api_settings.ACCESS_TOKEN_LIFETIME` as a **class attribute**,
evaluated once when the module is first imported — not re-read from
`api_settings` each time a token is minted. Django's `setting_changed`
signal (which `override_settings` relies on) updates simplejwt's
`api_settings` object, but nothing re-binds the already-defined
`AccessToken.lifetime` class attribute to the new value. The token
minted inside the `with` block silently used the real, positive
lifetime from the app's actual settings — `override_settings` had no
effect on it at all.

**Fix.** Used the token's own `set_exp()` method to set the `exp` claim
directly on that one instance, which is what simplejwt itself documents
for this exact case:

```python
token = AccessToken.for_user(plain_user)
token.set_exp(lifetime=timedelta(seconds=-1))
```

**Verification.** Reran the test — 401 with `error.code ==
"token_not_valid"`, as expected. The fix and the reasoning are recorded
inline in
[`backend/apps/accounts/tests.py`](backend/apps/accounts/tests.py) so
the same mistake doesn't get reintroduced later.

---

## 3. `eslint` flagged three "synchronous setState in an effect" errors

**Symptom.** `npx eslint .` on the frontend failed with three
`react-hooks/set-state-in-effect` errors: in the profile page, the
bookings page, and the OAuth callback page.

**Diagnosis.** Each was a different shape of the same underlying
pattern — a `useEffect` that runs a synchronous `setState` call before
(or without) any `await`/`.then()`:
- **Profile page:** copying `user.first_name` etc. into local form
  state via an effect the moment `user` became available — the classic
  "adjusting state when a prop changes" anti-pattern React's own docs
  warn about.
- **Bookings page:** an unnecessary `setBookings(null)` at the top of
  the tab-switch reload, purely to force a loading flash.
- **OAuth callback page:** validating the redirect's query params
  (`error`/`code`/`state`) and setting an error message synchronously
  before kicking off the async token exchange.

**Root cause / judgment call.** The first two were genuine instances of
the anti-pattern the lint rule exists to catch. The third is not — it's
an effect synchronizing with an external system (the URL the OAuth
provider redirected back to, plus the CSRF `state` token stashed in
`sessionStorage` before leaving for GitHub), which is exactly what
effects are for, and it only ever runs once on mount.

**Fix.** For the profile page, moved the form into a subcomponent that
only mounts once `user` exists, using `useState(user.first_name)` as a
lazy initializer instead of an effect — no state-copying needed at all.
For the bookings page, just removed the unneeded reset. For the OAuth
callback page, kept the synchronous logic and scoped a
`react-hooks/set-state-in-effect` disable to that block with a comment
explaining why, rather than contorting a one-time redirect handler to
satisfy a rule aimed at a different problem.

**Verification.** `npx eslint .`, `npx tsc --noEmit`, and `npm run
build` all pass clean; see
[`frontend/src/app/profile/page.tsx`](frontend/src/app/profile/page.tsx)
and
[`frontend/src/app/auth/callback/page.tsx`](frontend/src/app/auth/callback/page.tsx).

---

## 4. Re-booking your own only seat returned "session full" instead of "already booked"

**Symptom.** Found while manually tracing the booking logic during the
audit pass, then confirmed with a script: on a capacity-1 session, if
the same user who already holds the seat submits a second booking
request, the API returned `409 session_full` instead of `409
duplicate_booking`. The booking invariant itself still held (no second
booking was ever created either way), but the error was misleading —
telling a user "this is full" when the real, more useful answer is
"you're already in."

**Diagnosis.** `create_booking()` checked capacity before checking
whether the caller already had an active booking:
```python
active_count = session.bookings.filter(status=ACTIVE).count()
if active_count >= session.capacity:
    raise SessionFullError            # ran first
if Booking.objects.filter(user=user, session=session, status=ACTIVE).exists():
    raise DuplicateBookingError       # never reached in this case
```
On a capacity-1 session where the caller is the existing booking,
`active_count` (1) already `>= capacity` (1) before the duplicate check
ever ran.

**Root cause.** The two checks were ordered by how they were written,
not by specificity — capacity is a session-wide fact, duplicate-booking
is a fact about *this specific caller*, and the more specific condition
should be evaluated first when both are true simultaneously.

**Fix.** Reordered the checks so the duplicate-booking check runs
before the capacity check. See
[`backend/apps/bookings/services.py`](backend/apps/bookings/services.py).

**Verification.** Added a unit test, an API test, and strengthened the
existing same-user concurrent-race test to use capacity=1 specifically
(it previously used capacity=5, which never exercised this path).
Confirmed all three are meaningful by reverting the fix and watching
all three fail with the old, misleading `session_full` — then restored
the fix and reran the full suite (38/38 at that point) green.

---

## 5. A booking could still be cancelled after its session had already started

**Symptom.** `DELETE /api/bookings/:id/` succeeded (200, status
`"cancelled"`) even when the booking's session start time was in the
past — confirmed directly against a fresh session/booking created via
the Django shell.

**Diagnosis.** `cancel_booking()` only checked the booking's own
`status` (must be `ACTIVE` to cancel); it never looked at the session's
`start_time` at all. The frontend hides the "Cancel" button once a
booking is past (`!booking.is_past`), but that's a UI convenience, not
enforcement — a direct API call sailed straight through.

**Root cause.** An unexamined asymmetry: `create_booking()` has always
rejected booking an already-started session, but the equivalent
protection was never added to the cancellation path when it was
written, and nothing in the test suite exercised cancelling a
started-session booking to catch the gap.

**Fix.** Added the same `start_time <= now()` check to
`cancel_booking()`, reusing the existing `SessionAlreadyStartedError`
and wiring a matching `400` response in the view. See
[`backend/apps/bookings/services.py`](backend/apps/bookings/services.py)
and
[`backend/apps/bookings/views.py`](backend/apps/bookings/views.py).

**Verification.** Added a unit test and an API test; reverted the fix
and confirmed both fail (200 instead of 400) against the old behavior,
restored it, reran the full suite (40/40 at that point) green.

---

## 6. The uniform error envelope leaked `"http404"` as an error code

**Symptom.** `GET /api/sessions/999999/` (a session id that doesn't
exist) returned `{"error": {"code": "http404", "detail": "No Session
matches the given query."}}` — a code value that doesn't match any of
the project's other error codes (`not_found` would be the expected,
consistent one), because it's literally the lowercased Python class
name of the wrong exception object.

**Diagnosis.** The shared exception handler
(`apps/core/exceptions.py`) derives the response's `code` from
`getattr(exc, "default_code", exc.__class__.__name__.lower())`. DRF's
own `rest_framework.views.exception_handler` converts a raw Django
`Http404` (which is what `get_object_or_404`-style generic views
actually raise) into DRF's typed `NotFound` exception internally — but
that conversion happens on a variable local to DRF's own function and
is never exposed back to a wrapping handler. This project's handler was
still looking at the original, untyped `Http404`, which has no
`default_code` attribute, so the fallback kicked in and returned the
class name itself.

**Root cause.** Wrapping DRF's `exception_handler()` without
replicating the specific `Http404`/Django-`PermissionDenied` →
typed-exception conversion it performs internally before extracting
fields from the exception object.

**Fix.** Mirrored that conversion at the top of
`velora_exception_handler()` before reading `default_code`. See
[`backend/apps/core/exceptions.py`](backend/apps/core/exceptions.py).

**Verification.** Added a regression test asserting the code is
`not_found` for a nonexistent session id; reverted the fix and
confirmed the test reproduces the exact `"http404"` string, restored
it, reran the full suite (41/41) green. Also independently re-curled
several other error paths (401, 403, 405) to confirm they were never
affected — only the `Http404`/generic-`PermissionDenied` conversion
path was broken.

---

## 7. A losing refresh request could clear the winning one's cookie

**Symptom.** Driving the redesigned UI with a real authenticated
browser session (via Playwright, cookie injected to simulate a logged-in
user), navigating from the session detail page to `/bookings` bounced
back to `/login` — even though the user had a valid session moments
earlier. The Django dev server's request log showed the tell: every
single `POST /api/auth/refresh/` was firing **twice** in a row, and the
second of the pair was a `401`.

**Diagnosis.** `AuthProvider`'s mount effect calls `refreshSession()`
once to silently restore the session on page load. In dev mode, Next.js
runs React in Strict Mode, which deliberately double-invokes effects on
mount to help surface exactly this class of bug — so two refresh
requests fired back-to-back, both reading the *same* not-yet-rotated
refresh cookie from the browser. The backend rotates the refresh token
on every use and blacklists the old one (by design — see DECISIONS.md
#2). The first request's response rotated and blacklisted the cookie;
the second request, still holding the now-blacklisted old value, got a
`401` — and the `RefreshView`'s 401 path calls `_clear_refresh_cookie()`,
deleting the cookie outright. Depending on which response the browser
applied last, that clear could land *after* the first request's valid
new cookie, silently logging the user out immediately after logging
them in.

**Root cause.** `refreshSession()` had no protection against being
called twice concurrently from the same tab. Strict Mode's double
mount-effect is the trigger that surfaced it here, but the underlying
race isn't Strict-Mode-specific — rotation-plus-blacklist means *any*
two near-simultaneous refresh calls sharing one stale cookie will
produce exactly this "loser clears the winner's cookie" outcome,
including plausible real-world triggers this project doesn't have
automated coverage for (a slow network causing a retry, more than one
component's 401-retry path firing close together).

**Fix.** De-duplicated `refreshSession()` with a single shared in-flight
promise: if a refresh is already in progress when another caller asks
for one, they all get the same result instead of firing a second
request. See
[`frontend/src/lib/api-client.ts`](frontend/src/lib/api-client.ts).

**Verification.** Confirmed via the Django dev server's request log
before and after: two `POST /api/auth/refresh/` calls (200 then 401)
per page load before the fix, exactly one (200) after. Re-ran the
Playwright flow that originally surfaced it — session detail → bookings
→ profile, three consecutive navigations — and the user stayed
authenticated throughout. This is a frontend-only fix; it doesn't touch
`RefreshView`'s rotation/blacklist behavior, which is correct as
designed (see DECISIONS.md #2) — the bug was two callers sharing one
stale cookie, not the rotation policy itself.

---

## 8. Two visual-QA findings from actually looking at the rebuilt UI

Grouped together since both were caught the same way — by rendering the
redesigned pages and inspecting them, not by assuming a plausible-looking
component was correct — and both were one-line fixes once found.

**8a. `--color-muted` failed WCAG AA contrast.** Computing the actual
contrast ratio for the new warm palette (rather than eyeballing it)
showed `--color-muted` (used for card metadata at 13px) at ~3.5:1
against the background — below the 4.5:1 minimum for normal-sized text.
Darkened from `#8a8375` to `#6e6659` (~5.3:1). See DECISIONS.md #4.

**8b. Dashboard/booking list rows broke on mobile.** `Card`s in the
creator dashboard and bookings list used `flex items-center
justify-between` unconditionally. At desktop widths that's fine; at
390px, a two- or three-line wrapped title pushed the action buttons
(Edit/Delete, or the status badge/Cancel button) into an awkward
squeeze beside it instead of a clean stack. Caught by screenshotting
every reworked page at a 390px viewport, not by assuming a flex layout
that looked fine on desktop would degrade gracefully. Fixed with
`flex-col sm:flex-row` so the action row drops below the content on
narrow screens. See
[`frontend/src/app/creator/dashboard/page.tsx`](frontend/src/app/creator/dashboard/page.tsx)
and
[`frontend/src/app/bookings/page.tsx`](frontend/src/app/bookings/page.tsx).

---

## 9. A Mermaid diagram that would have silently failed to render on GitHub

**Symptom.** None visible by reading the diagram source — it looked
like ordinary, readable message text.

**What happened.** The first draft of the booking-concurrency sequence
diagram in `README.md` wrote a step as:

```
A->>DB: BEGIN; SELECT session FOR UPDATE
```

using `;` the way it reads in prose — "begin the transaction, then
select." Mermaid's sequence-diagram grammar doesn't treat `;` as
punctuation inside message text; it's a statement separator, so the
parser read this as two separate (and, for the second half, invalid)
statements and would have failed to render the whole diagram.

**How it was caught.** Not by proofreading the Mermaid source — by
actually rendering it. Installing `@mermaid-js/mermaid-cli` and running
`mmdc` against all three new diagrams locally surfaced a parse error
pointing at exactly this line before any of them were committed.

**Fix.** Rewrote the two offending steps to avoid `;` in message text
entirely (`"SELECT session FOR UPDATE (inside BEGIN)"` and `"INSERT
booking, then COMMIT"`), then re-rendered all three diagrams and
visually confirmed each one before committing.

**Why this is worth logging.** It's the same class of mistake as
issues 1–8, just in documentation instead of code: something that
looked correct on inspection and was only proven correct (or, here,
proven wrong) by actually running it.

---

## 10. The entire OAuth/JWT lifecycle had zero automated test coverage

**Symptom.** None visible from running the existing suite — all 41
tests passed, including several that issue a JWT directly via
`AccessToken.for_user(...)` in the test itself and then check that
endpoint correctly *validates* it.

**What was actually missing.** `GitHubCallbackView` (the code-exchange
endpoint that creates/looks up a user and issues the first token pair),
`RefreshView` (rotation), and `LogoutView` (blacklisting) had no tests
at all — `apps/accounts/tests.py` only ever tested what happens once a
valid token already exists, never how one is issued, rotated, or
revoked. This is exactly the part of the system a real GitHub login
exercises first, and it was the least-tested part of it.

**How it was caught.** While doing a final audit specifically of the
OAuth/JWT lifecycle (prompted by configuring real GitHub credentials
for the first time), grepping the codebase for any test referencing
`GitHubCallbackView`, `github/callback`, or `exchange_code_for_profile`
turned up nothing — not a failing test, an *absent* one. The gap was
found by asking "where's the test for this," not by a red test run.

**Fix.** Added nine tests to `backend/apps/accounts/tests.py`:
`exchange_code_for_profile` is mocked (a real GitHub authorization
can't be scripted without a human's actual consent-screen click), but
everything downstream is exercised for real: new
user creation with correct fields, `get_or_create` idempotency across
repeat logins with profile-field updates, the two GitHub-side failure
paths (`oauth_exchange_failed`, `oauth_provider_unreachable`), refresh
token rotation issuing a new access token, the rotated-out token being
rejected on reuse, logout blacklisting the refresh token, and the
refresh cookie's actual attributes (`httponly`, `path=/api/auth/`,
`samesite`) rather than just its presence.

**Verified as load-bearing, not just added.** Per this project's
standing discipline, the rotation/blacklist test wasn't trusted on
sight: `old_refresh.blacklist()` in `RefreshView` was temporarily
replaced with `pass`, the suite was rerun, and
`test_refresh_rotates_token_and_issues_new_access_token` failed exactly
as expected (`200 == 401`, i.e. the "already used" refresh token was
accepted again). The real line was restored and the suite rerun clean
— 50/50, backend test count up from 41.

**Why this is worth logging.** The other nine issues in this file were
all "the code does the wrong thing." This one is different: the code
was already correct (the OAuth/JWT views had been exercised manually,
by hand, multiple times across earlier phases) — what was missing was
proof of it that survives a refactor. "It works when I click through
it" and "there's a test that fails if it breaks" are different claims,
and only the second one holds up over time.

---

# Third audit pass — the final hardening review

The previous two passes reviewed code that had already been declared
finished. This one started from the assignment brief rather than from
either report, re-derived every requirement against the repository, and
attacked the running deployment before reading any of it. It found the
worst bug in the project's history.

---

## 11. `docker compose up --build` failed for everyone but me

**Symptom.** None, locally. The stack built and ran fine on the machine
it was written on, and had been demonstrated working repeatedly.

**How it was found.** Not by reading code — by asking the question
"what does the *evaluator* actually type first?" and then doing exactly
that: cloning the repository into a scratch directory and building
there, rather than trusting the working tree.

```
 > [runner 4/6] COPY --from=builder /app/public ./public:
------
ERROR: failed to compute cache key: "/app/public": not found
```

**Root cause.** `frontend/Dockerfile`'s runner stage copies `public/`
unconditionally. `public/` existed on disk locally but was **empty**,
and Git does not track empty directories — so it was never in a commit.
Every clone of the repository was missing it, and the build died at that
`COPY`. The one documented startup command in the README did not work
for anybody who had not also been the person who created the folder.

**Why it survived two audits.** Both previous passes verified Docker by
running `docker compose up --build` in the working tree, where the
untracked directory was sitting there. The failure only exists on the
path nobody had tested: a clean clone.

**Fix.** Two independent guards, because this class of bug is invisible
from the machine that has the file:
- `frontend/public/robots.txt` — a genuinely useful file, whose
  presence keeps the directory tracked.
- `RUN mkdir -p public` in the builder stage, so the build never
  depends on that again.

**Verification.** `git clone` into a scratch directory → `docker
compose build` → both images built; then `up -d` → all four services
healthy; then routing checked through Nginx for `/`, `/sessions`,
`/api/health/`, `/admin/login/` and a static asset. All 200.

**The lesson.** "It works on my machine" has a specific, testable
meaning: the working tree is not the repository. Anything the build
consumes must be verified from a fresh clone, not from the directory
you built it in.

---

## 12. A host could book a seat on their own session

**Symptom.** None visible: the session page tells a creator "you're
hosting this session, so there's no seat to book", and hides the button.

**Diagnosis.** That sentence was the *entire* enforcement. `POST
/api/bookings/ {"session": <own session>}` returned `201` and consumed
one of the host's own seats — on a capacity-1 session, that means the
host silently made their own session unbookable.

**Root cause.** `create_booking()` checked start time, duplicates and
capacity, but never compared `session.creator_id` to the booking user.
The frontend check was written first and the backend rule was never
added behind it.

**Fix.** `CannotBookOwnSessionError` in the service, returned as `403
cannot_book_own_session`. A test asserts a *different* creator can
still book the session, so the rule stays "you can't book your own",
not "creators can't book".

**Verification.** `test_creator_cannot_book_their_own_session`, plus a
live `POST` through Nginx as the host: `403 cannot_book_own_session`,
`Booking.objects.count() == 0`.

---

## 13. Capacity could be cut out from under people who had already booked

**Symptom.** A session showing `seats_taken=5, capacity=1`.

**Diagnosis.** The whole locking design exists to guarantee "active
bookings ≤ capacity". It guards the *booking* side rigorously. Nothing
guarded the *capacity* side: `PATCH /api/sessions/<id>/ {"capacity": 1}`
on a session with five attendees was accepted, producing exactly the
oversubscribed state the row lock exists to prevent — reached from the
other direction.

This was known before this pass and had been written up in the README
as a deliberate limitation. Re-reading it against the brief, that
defence didn't hold: the assignment's core invariant is stated
unconditionally, and "a creator might want to right-size a listing" is
an argument for a *clear error*, not for silently breaking it.

**Fix.** Serializer validation refusing a capacity below the current
active-booking count, with a message naming the number. Raising
capacity, and lowering it to exactly the booking count, both still work
— and cancelled bookings correctly don't count.

**Verification.** Four tests covering refuse / raise / lower-to-exact /
cancelled-don't-count, plus a live `PATCH` through Nginx returning
`400` with a sentence the UI renders as-is (screenshot in the report).

---

## 14. `DELETE /api/bookings/abc/` returned a 500

**Symptom.** A stack trace and `500 Internal Server Error` for a plainly
malformed URL.

**Diagnosis.** DRF's router lookup regex is `[^/.]+` — it matches any
non-slash segment, not just digits. `BookingViewSet.destroy` passed the
captured `pk` straight to `Booking.objects.get(pk=pk)`, and Django
raised `ValueError: Field 'id' expected a number but got 'abc'`, which
no exception handler was catching.

The catalog viewset was immune to the identical URL shape purely by
luck: DRF's `get_object_or_404` wrapper already catches `ValueError` and
re-raises `Http404`. The bookings viewset uses a service function
instead of a generic, so it never got that protection.

**Fix.** Parse the id explicitly; an id that *cannot* exist gets the
same 404 as an id that merely doesn't.

**Verification.** `test_malformed_booking_id_returns_404_not_500`, plus
the live request through Nginx: `404 booking_not_found`.

---

## 15. A deactivated account could keep minting access tokens

**Diagnosis.** DRF's `JWTAuthentication` refuses an access token whose
user is inactive. But `/api/auth/refresh/` doesn't go through
`JWTAuthentication` — it reads the cookie and resolves the user itself,
with `User.objects.get(pk=...)` and no `is_active` filter. A disabled
account could therefore keep exchanging its refresh cookie for fresh
access tokens for the full seven-day refresh lifetime.

**Fix.** `User.objects.get(pk=..., is_active=True)`; the existing
`User.DoesNotExist` branch already returns `401` and clears the cookie.

**Verification.** `test_deactivated_user_cannot_refresh`.

---

## 16. Validation errors reached users as a JSON blob

**Symptom.** Submitting an invalid session form showed the user the
literal text `{"capacity":["Capacity must be at least 1."]}`.

**Diagnosis.** DRF returns field errors as a nested object. The
envelope passed that through untouched as `detail`, and the frontend
renders `detail` as the message — so `api-client.ts` fell back to
`JSON.stringify` on a non-string. Neither side was wrong on its own;
the contract between them was never specified for this case.

**Fix.** The exception handler flattens field errors into a sentence
("Capacity: 3 people have already booked…") while preserving the
structure under a new `fields` key, so a form can still bind messages
to inputs.

**Verification.** `test_validation_errors_are_flattened_into_a_readable_sentence`
asserts `detail` is a string with no `{` in it, and that `fields` still
carries every field. Screenshot of the rendered message in the report.

---

## 17. Nginx served 502s after a single service was rebuilt

**Symptom.** After `docker compose up -d --build frontend`, every page
returned `502 Bad Gateway`. Restarting Nginx fixed it.

**Diagnosis.** An `upstream { server frontend:3000; }` block resolves
its hostname **once, at startup**, and caches the address for the life
of the process. Recreating the frontend container gives it a new IP;
Nginx went on proxying to an address that no longer existed.

**Fix.** Target the upstream through a variable with Docker's embedded
resolver (`resolver 127.0.0.11 valid=10s`), which forces a re-resolve.
`$request_uri` has to be appended explicitly, since a `proxy_pass`
containing a variable stops forwarding the URI on its own.

**Verification.** `docker compose up -d --force-recreate frontend` with
Nginx deliberately left untouched → `/sessions` still `200`.

---

## 18. Next.js was listening on exactly one interface

**Diagnosis.** Found while adding a Compose healthcheck for the
frontend, which failed every time. Next's standalone server binds to
`$HOSTNAME`, and Docker sets that to the container id — so the server
listened on the container's own IP and nothing, healthcheck included,
could reach it on `localhost`. Nginx was unaffected because it connects
by container IP, which is why this was invisible until something inside
the container tried.

**Fix.** `ENV HOSTNAME=0.0.0.0` in the runner stage.

**Verification.** `docker compose ps` reports the frontend `(healthy)`;
Nginx now waits on that health rather than on the container merely
having started.

---

## 19. Three things that were only visible by looking at the pages

Found by rendering every page at desktop, tablet and phone widths and
actually reading them, rather than by testing.

**a. On a phone, the booking button was below everything.** The session
page's two-column desktop layout collapses to one column, putting the
booking panel after the entire description — the primary action on the
page required a full scroll. The first fix moved it to the top, which
was worse: it asked people to book something they hadn't been told the
name of yet. The shipped layout places the three blocks explicitly per
breakpoint: title, then panel, then description.

**b. Bookings were listed in the order they were booked.** `Booking`'s
default ordering is `-created_at`, so "My bookings" could show next week
above tomorrow. Upcoming now orders by session start; past runs
newest-first.

**c. The datetime input clipped its own value.** In a 512px form split
into three columns, the native `datetime-local` control had ~150px and
rendered `31/08/2026, 0(`. Start time now takes a full-width row.

**d. The same timestamp appeared twice.** The session page printed the
absolute start time as its eyebrow and again in the booking panel two
inches away. The eyebrow is now a relative dateline ("In 4 days"),
which says something the panel doesn't.

**e. The session detail page was mostly empty air.** At desktop width, a
session with a short (or even a normal two-paragraph) description left
roughly 400px of blank page between the content and the footer — the
two-column layout has nothing to size itself against once the
description ends. Found by screenshotting several real sessions, not
just the one used during development, which happened to have an
unusually long description that hid the problem. Fixed by adding a
"More from this host" section below the fold, backed by a small,
genuinely new `?creator=<id>` filter on `/api/sessions/` (with its own
test) rather than a client-side workaround — it fills the space with
something a visitor would actually want (other sessions worth
browsing) instead of decorative padding, and only appears when the
host actually has other upcoming sessions to show.
