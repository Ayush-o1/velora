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
