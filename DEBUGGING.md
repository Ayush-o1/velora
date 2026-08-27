# Debugging Log

Real issues found and fixed while building Velora, surfaced by the
project's own test suite and lint tooling — not invented after the
fact. Each was caught during the "implement → test → inspect → fix →
re-test" loop before being committed.

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
