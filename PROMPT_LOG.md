# Prompt Log

**Tool:** Claude Code (Anthropic), model **Claude Sonnet 5**, running as
an autonomous coding agent with shell/file/git access — not a
copy-paste chat assistant. This file logs how it was used honestly:
this project was built primarily by that agent, operating under one
detailed, explicit engineering brief and process from me, with its own
self-testing built into every phase. I reviewed, ran, and verified the
result myself before it's presented here as my submission.

---

## How the AI was used

I gave the agent a single comprehensive brief (below) that:
- restated the company's assignment brief in full,
- specified the required stack and every functional requirement,
- **mandated the engineering process itself**: implement → inspect →
  test → run → find problems → fix → re-test → commit → push, phase by
  phase, never "generate everything and assume it works," and
- required the agent to research uncertain technical decisions rather
  than guess, and to record real decisions/bugs/mistakes rather than
  fabricate them.

The agent then worked through the phases (repo audit → backend models →
auth → catalog → bookings/concurrency → frontend → Docker/Nginx →
security review → documentation) largely autonomously, because the
brief was specific enough not to need turn-by-turn steering — but it
was required to actually run every test it wrote, actually boot the
app in a browser, and actually run `docker compose up` against a real
Postgres before reporting a phase done. That verification discipline is
what this log and DEBUGGING.md are checking, not trusting.

---

## Prompt 1 — the full engineering brief

**Prompt (summarized; verbatim brief was ~4,000 words):** Build Velora,
a Sessions Marketplace, against the attached company assignment
(`Ahoum_FullStack_Developer_Assignment_24h.docx`), using Django+DRF,
Next.js, PostgreSQL, GitHub/Google OAuth issuing JWTs, and a
Docker-Compose+Nginx deployment. Specifically called out: booking
capacity must be race-safe under real concurrency (not a naive
check-then-insert), creator-only actions must be enforced server-side
regardless of the frontend, and the repo must contain
PROMPT_LOG.md/DECISIONS.md/DEBUGGING.md/README.md with real (not
fabricated) content. Work in verified phases; commit incrementally;
never force-push or add AI identities as Git contributors.

**What was used.** Essentially the entire brief — it's the spec this
whole codebase implements. The agent additionally extracted the actual
`.docx` assignment text (via a small Python/zipfile script, since the
file is binary) to cross-check the paraphrased brief against the
original wording before starting, rather than trusting the paraphrase.

**What was changed / rejected from the agent's own first instincts:**
- The agent's first pass at `SessionViewSet.create()` assumed the write
  serializer's response body would contain the new row's `id`; it
  doesn't (write serializers only list writable fields). Caught by the
  test suite the agent itself wrote, not by me reading the code first.
  See DEBUGGING.md #1.
- The agent's first attempt at testing an expired JWT used
  `override_settings` to shrink the token lifetime, which — as it
  turns out — does not affect `simplejwt`'s `AccessToken` class (the
  lifetime is bound as a class attribute at import time). The agent
  diagnosed this from the library's actual behavior (by watching the
  test fail with 200 instead of 401) rather than assuming the test was
  right. See DEBUGGING.md #2.
- I rejected the agent's first instinct to skip a real concurrency
  proof and rely solely on the DB unique constraint. `select_for_update`
  was the piece the agent had to add and then prove was load-bearing —
  it did this by temporarily deleting the lock and rerunning the race
  test, watching it fail (12/12 bookings succeeded on a 1-seat session),
  then restoring the fix. That before/after evidence is what makes the
  concurrency claim in DECISIONS.md verifiable rather than asserted.

**How it was verified.** Every claim in this repo about what "works" is
backed by something that was actually run in this session: the pytest
suite (36 tests, `backend/`), `npx eslint .` / `tsc --noEmit` / `npm run
build` (frontend), a headless-Chromium walkthrough of the real running
app (catalog, login, booking, creator dashboard, role-gated redirects),
and a full `docker compose up --build` cycle including a restart-based
persistence check and a live 10-way concurrent-booking HTTP race
against the running stack. Nothing here is "should work."

---

## Prompt 2 — "continue"

After the agent reported Phase 0 (repo/assignment audit) and moved into
implementation, I sent a single `continue` to let it proceed through
the remaining phases without interruption, per the brief's own
instruction to "continue autonomously whenever the task can be
completed safely" and only stop for things that generally require a
human (see below).

**What was used.** The agent continued through backend implementation,
frontend implementation, Docker/Nginx, the security pass, and this
documentation, checking in with progress summaries at natural
checkpoints (each phase's commit) rather than asking for permission at
each step.

**How it was verified.** Same standard as above — each phase's commit
message in the Git history states what was actually tested and how;
`git log` is the audit trail for this.

---

## Human-in-the-loop point: GitHub OAuth App credentials

The agent correctly identified that it cannot create a GitHub OAuth
App itself (no API for it; requires the GitHub web UI and a secret
that shouldn't be typed into a chat prompt) and stopped to ask me to
create one and supply the Client ID/Secret, rather than inventing
placeholder credentials or skipping OAuth verification silently. This
is recorded here because it's the one point in the process that
genuinely required my action rather than the agent's.

---

## Prompt 3 — independent final audit, "do not trust the previous report"

Before treating the project as submission-ready, I gave the agent a
separate, deliberately adversarial instruction: re-audit the entire
repository from scratch as a skeptical senior engineer, without relying
on its own earlier "complete" report, reasoning through the concurrency
mechanism line-by-line, attempting authorization bypasses like a
malicious API client, and re-running every verification claim rather
than citing the earlier session's results.

**What was used.** The agent re-read the core source files fresh (not
from its own summary), re-traced the `select_for_update()` locking
sequence question-by-question (which row, when locked, when read, when
committed, what a second transaction observes), and re-ran the
concurrency proof by deliberately breaking the lock again rather than
citing the earlier run.

**What this pass found and fixed** (the agent's own prior work, not a
strawman): three real, previously-undetected defects — a booking
check-ordering bug that returned a misleading error code, a missing
authorization check on booking cancellation, and a bug in the shared
error-handling code itself that leaked an internal Python class name as
an API error code. All three are detailed with full root-cause analysis
in DEBUGGING.md #4–6. None of these were caught by the first pass's
test suite, which is precisely why a second, skeptical pass mattered —
"the tests pass" is not the same claim as "there are no more bugs."

**How it was verified.** For each of the three fixes, the same
discipline as the first pass: revert the fix, confirm the relevant
test(s) actually fail against the old behavior, restore the fix, rerun
the full suite. Also independently attacked the live Docker deployment
directly with `curl` and hand-crafted JWTs — cross-creator edits,
spoofed `user`/`is_staff` fields in request bodies — rather than only
trusting the pytest suite's version of the same claims.

---

## Prompt 4 — frontend redesign for visual/product quality

With the backend, infrastructure, and correctness work verified, I gave
the agent a separate, detailed brief to take the (functionally complete
but visually generic) frontend and rebuild it with a real, deliberate
design identity — explicitly not a "prettier colors and more shadows"
pass, and explicitly not something that reads as an AI-templated
dashboard. The brief specified a phased design process (audit → define
identity → rebuild systematically → verify in a real browser at
multiple viewports → protect existing functionality throughout) rather
than "make it look nicer."

**What was used.** The agent defined a specific visual identity before
touching any component (Fraunces for display type, Inter kept strictly
to UI/body text, a warm paper-and-pine-green palette instead of default
blue/purple or black/neon) and rebuilt the design-token layer, a proper
component system (`Button`, `Card`, `Badge`, `Dialog`, `Tabs`, form
fields), and every page on top of it — deliberately avoiding new
dependencies (the native `<dialog>` element instead of a modal library;
see DECISIONS.md #5) so the bundle stayed lean (704KB of client JS,
unchanged dependency count).

**What was changed / rejected from the agent's own first-pass work:**
- The agent's first implementation of the mobile nav closed the menu
  via a `useEffect` keyed on the route (`pathname`) — the same
  "adjusting state via an effect" anti-pattern flagged earlier in this
  project (see item 3 below and DEBUGGING.md #3), caught again
  immediately by the same lint rule. Fixed by closing the menu directly
  in each link's `onClick` instead of syncing it from route changes.
- The agent's first-pass session/booking card layout
  (`flex items-center justify-between`, unconditional) looked fine at
  desktop width and was never actually checked at mobile width before
  being accepted. Caught by screenshotting at 390px specifically,
  fixed with `flex-col sm:flex-row`. See DEBUGGING.md #8b.
- I rejected the agent's first color palette on inspection alone being
  "good enough" — required computing actual WCAG contrast ratios for
  every token pairing rather than trusting a visually-plausible palette,
  which is what caught the `--color-muted` failure. See DEBUGGING.md #8a.

**How it was verified.** `eslint`/`tsc`/`next build` clean throughout;
every rebuilt page driven with a real, authenticated headless-browser
session (cookie-injected JWT, matching the approach used for backend
verification) at both desktop and 390px mobile viewports, screenshotted
and actually inspected, not just "it compiled"; the full backend test
suite (41/41) reconfirmed untouched; a fresh `docker compose down -v &&
up --build` cycle confirmed the production build renders identically to
dev through Nginx with zero console errors.

---

## Prompt 5 — architecture and technical-presentation audit

With the product, correctness, and design work verified, I gave the
agent a final brief specifically about the architecture itself and how
it's presented to an evaluator: audit domain boundaries, data flow, and
the booking transaction end-to-end against the real code (not
assumption), and only then decide whether the repository's diagrams and
docs actually represent the quality of the implementation. Explicitly
scoped against over-engineering: "simple + explicit + maintainable"
was stated as preferable to "complex + impressive-looking," and the
agent was told not to restructure working code merely to look more
sophisticated.

**What was used.** The agent re-read the real backend source
(`services.py`, `views.py`, `permissions.py`, `exceptions.py` across
all four Django apps) and the frontend's `lib/` and page components
fresh, rather than relying on this file's own earlier summaries of
that code, to check whether the accounts/catalog/bookings/core
boundary and the services-not-views placement of business logic still
held up. It also re-derived the booking concurrency sequence directly
from `create_booking()`'s actual statement order (start-time check,
then duplicate check, then capacity check — in that order, for the
specific reason documented in the function's own docstring) rather
than from memory, before diagramming it.

**What was changed.** Nothing in the backend or frontend code. The
audit's conclusion was that the existing domain boundaries, service
layer, and permission classes were already the right shape — thin
views, isolated services, object-level permission checks, no dumping
ground in `core` — so the honest outcome was "leave it alone," per the
brief's own instruction. What changed was purely presentational: the
README's single cramped ASCII architecture diagram was replaced with
three focused Mermaid diagrams (infrastructure, GitHub OAuth flow, and
the booking row-lock sequence), and a "Preview" section with two real
screenshots was added.

**What was caught by actually running it, not by inspection.** The
first draft of the booking-concurrency sequence diagram used `;` inside
message text (`"BEGIN; SELECT session FOR UPDATE"`) to read naturally
in prose. Mermaid's sequence-diagram grammar treats `;` as a statement
separator, not punctuation, so that diagram would have silently failed
to render on GitHub. This wasn't caught by reading the Mermaid source —
it was caught by actually installing `@mermaid-js/mermaid-cli` and
rendering all three diagrams to PNG locally before committing them,
which is the same "run it, don't just write it" standard applied to
code throughout this project, applied here to documentation.

**How it was verified.** All three Mermaid diagrams were rendered
locally with `mmdc` and visually inspected against the real source
they describe (the `SELECT ... FOR UPDATE` ordering in `services.py`,
the exact cookie/response shape in `accounts/views.py`) before being
committed. The two screenshots in the README were captured against the
actual running Docker stack with realistic seeded data (via
`manage.py shell`, not fabricated markup), then that seed data was
deleted so the shipped deployment starts genuinely empty, matching
what the rest of this README already claims. The full backend suite
(41/41) was re-run against the same Docker Postgres afterward to
confirm the seed/cleanup round-trip left no residue.

**Database setup, addressed in the same pass.** I separately asked the
agent to check whether Velora needed a dedicated local PostgreSQL
database, since I had host PostgreSQL/MongoDB credentials available
for unrelated projects. The agent inspected `docker-compose.yml` and
`settings.py` first rather than assuming, and correctly reported that
Velora already runs its own self-contained, dedicated `velora`
database inside Docker's named volume — entirely separate from the
host's Homebrew PostgreSQL instance and from the unrelated databases I
mentioned — so no new database was created and nothing on the host
machine was touched.

---

## Prompt 6 — GitHub OAuth App research, then real end-to-end verification

Two related prompts. First, before touching any configuration, I asked
the agent to independently verify GitHub's *current* official OAuth App
setup process (not rely on prior knowledge) and cross-check it against
Velora's actual source — exact settings page, exact form fields, exact
callback URL and env var names as the code expects them, and any recent
GitHub-side changes that could matter. Second, once I'd registered a
real OAuth App and put the real Client ID/Secret in `.env`, I asked for
a full end-to-end re-verification of the whole assignment — not a
report that trusted the previous one.

**What was used for the research prompt.** The agent fetched GitHub's
live documentation pages directly (`creating-an-oauth-app`, and the
GitHub Changelog) rather than recalling them from training data, and
separately re-read `accounts/services.py`, `settings.py`,
`docker-compose.yml`, and `.env.example` to derive the exact callback
URL and variable names from the code itself. It surfaced two genuinely
current facts neither of us had front-of-mind: GitHub started
returning an `iss` parameter in OAuth callbacks in April 2026 (RFC
9207) — irrelevant here since Velora's exchange code doesn't read that
field — and started defaulting new OAuth Apps to short-lived tokens in
August 2026 — also irrelevant, since Velora never stores the GitHub
token past the single login exchange. Checking rather than assuming
either was safe to ignore is what made "no code change needed" an
actual conclusion instead of a guess.

**What was used for the verification prompt.** The agent inspected the
real `.env` file byte-for-byte (line endings, quoting, trailing
whitespace, duplicate keys — none found) rather than assuming correct
values meant correct formatting, then discovered the running containers
predated the credentials being added (backend env showed the client ID
and secret as empty, and the ID wasn't present in the built frontend
bundle) and rebuilt. It then verified the OAuth wiring itself by
actually clicking "Continue with GitHub" in a real (if cookie-less)
headless browser and capturing the resulting network request — GitHub
served its real login page rather than an invalid-client-id error,
which is real evidence the registered app and redirect URI are valid,
without ever entering my GitHub credentials or completing the consent
screen myself.

**What this pass found and fixed.** While specifically checking test
coverage of the OAuth/JWT lifecycle — not because anything was
failing — it found that `GitHubCallbackView`, `RefreshView`, and
`LogoutView` had zero automated tests between them; every existing auth
test assumed a token already existed rather than testing how one gets
issued, rotated, or revoked. Nine tests were added covering user
creation, `get_or_create` idempotency, both GitHub-failure error codes,
refresh rotation, reuse-after-rotation rejection, and logout
blacklisting. One of them (the rotation/reuse test) was verified the
same way as every fix in this project: `old_refresh.blacklist()` was
temporarily replaced with a no-op, the suite was rerun and the new test
failed exactly as expected, then the real line was restored. Full
detail in DEBUGGING.md #10.

**What was correctly identified as needing me, not the agent.** The
literal "click Authorize" step on GitHub's real consent screen, since
that requires my actual GitHub account and consent — the agent was
explicit that it stopped there rather than attempting to simulate or
bypass it.

**How it was verified.** Backend suite 50/50 (41 pre-existing + 9 new)
against the real Postgres container; a fresh 20-contender concurrency
race via `prove_concurrency` (1 success, 19 correctly rejected); live
`curl` attacks against the running API through Nginx (cross-role and
cross-creator access, spoofed `creator`/`is_staff`/`is_superuser`
fields, duplicate/full/already-started booking rejections) — all
rejected server-side, with the ownership-spoofing attempt independently
confirmed unwritten in the database, not just absent from the response;
a real Docker restart-based persistence check (`backend`+`db`, not
`-v`) with a marker row that survived; frontend `eslint`/`tsc`/`build`
clean; three real authenticated browser sessions (anonymous, a learner,
a creator) driven via cookie-injected JWTs with zero page errors,
including a mobile-viewport check and an OAuth-cancellation error page;
and a full git/secret-history scan confirming the real Client
ID/Secret were never committed. All seed/attack-test data created
during this pass was deleted afterward — the deployment handed back is
the same genuinely-empty state it started in.

---

## What AI got wrong / what I corrected

Concrete, from this project (full detail in DEBUGGING.md):

1. **Wrong assumption about DRF serializer response shape.** The agent
   wrote `SessionViewSet.create()` assuming `super().create()`'s
   response body would contain the new object's `id`, because that's
   true for a serializer that includes `id` — but the write serializer
   in use deliberately doesn't expose it. This produced a 500
   (`KeyError: 'id'`) on every session creation, caught immediately by
   `test_creator_can_create_session`. I had the agent fix it by
   re-fetching the instance by the serializer's own `.instance.pk`
   instead of trusting the response body's shape — see DEBUGGING.md #1.

2. **Wrong assumption about `simplejwt` + `override_settings`.** The
   agent assumed shrinking `ACCESS_TOKEN_LIFETIME` via Django's
   `override_settings` inside a test would make a freshly-minted token
   expire immediately. It doesn't — `AccessToken.lifetime` is bound as
   a class attribute when the module is first imported, so the override
   never reaches it. The test silently exercised a *valid* token and
   asserted the wrong thing initially got the wrong result (200 instead
   of the expected 401), which is how the mistake surfaced. Fixed by
   using `token.set_exp()` directly on the token instance instead —
   see DEBUGGING.md #2.

3. **Checks ordered by how they were written, not by specificity.** The
   agent's original `create_booking()` checked session capacity before
   checking whether the caller specifically already held the seat, so a
   user re-submitting their own only booking on a capacity-1 session
   got told the session was "full" rather than that they were already
   booked — a real inconsistency the first pass's own test suite never
   exercised, because its duplicate-booking test used capacity=5 (where
   the ordering doesn't matter) rather than a tight capacity. Found by
   deliberately re-tracing the function's logic against the exact
   scenario in the assignment brief (capacity=1) during the audit pass,
   not by a failing test — the test was written *after* spotting it by
   inspection, then confirmed to fail against the old code before being
   trusted. See DEBUGGING.md #4.

4. **An enforcement rule existed on one side of an operation but not
   its mirror.** `create_booking()` had always rejected booking an
   already-started session; `cancel_booking()`, added later, never got
   the equivalent check, so a booking could still be cancelled after
   the fact via a direct API call — the frontend hid the button, which
   masked the gap in every manual click-through the first pass did.
   Found by deliberately asking "does the create-side restriction have
   a mirror on the cancel side?" rather than assuming symmetry existed
   because it seemed like it should. See DEBUGGING.md #5.

5. **The AI's own error-handling code had a bug in it.** The shared
   exception handler the agent wrote to give the API a consistent
   `{"error": {"code", "detail"}}` shape had a subtle flaw: it assumed
   `exc.__class__.__name__.lower()` was a safe fallback for extracting
   an error code, without accounting for the fact that DRF silently
   upgrades a raw `Http404` into its own typed exception *internally*,
   in a way invisible to a wrapping handler. The result was a generic
   404 leaking `"http404"` — the literal Python class name — as the API
   error code, defeating the handler's own stated purpose. This is
   worth calling out specifically because it's a bug in code meant to
   make errors *more* legible, found only because the audit pass
   distrusted even the plumbing that was supposedly done and tested.
   See DEBUGGING.md #6.

All five were caught by actually running something — a test, a live
`curl` against the running stack, a deliberate revert-and-rerun — not
by inspection or by trusting an earlier pass's conclusion. That
distinction is the actual point of the "implement → test → inspect →
fix → re-test" loop the brief required, rather than a "generate and
assume" workflow, and it's why a second, skeptical audit pass over
already-"working" code was worth doing at all.

6. **A frontend race condition the agent's own auth code introduced and
   then found by actually using the app, not by reading the code.** The
   silent-refresh-on-mount call had no protection against being invoked
   twice concurrently — invisible from reading `AuthProvider` in
   isolation, since it looks like an ordinary one-shot effect. It only
   surfaced when the agent drove the redesigned UI with a real
   authenticated session and hit an unexpected logout, then went
   looking for why instead of dismissing it as a one-off test-script
   fluke — the server log's duplicated `POST /api/auth/refresh/` calls
   were the actual evidence, not a guess. See DEBUGGING.md #7.

7. **Accepted a plausible-looking layout without checking it at the
   viewport that would break it.** The agent's card-row layout for the
   dashboard and bookings list was written once, glanced at on a
   1440px screenshot, and treated as done. It broke specifically at
   mobile width, which nothing in that first pass had actually
   rendered. See DEBUGGING.md #8b.

8. **A documentation diagram with a real syntax bug, caught the same
   way as a code bug.** The first draft of the booking-concurrency
   Mermaid diagram used a semicolon inside message text
   (`"BEGIN; SELECT session FOR UPDATE"`) for readability, not knowing
   Mermaid's sequence-diagram grammar treats `;` as a statement
   separator — it would have silently failed to render on GitHub. Found
   by actually rendering all three diagrams locally with
   `@mermaid-js/mermaid-cli` before committing them, not by proofreading
   the Mermaid source. See DEBUGGING.md #9.

9. **A whole code path with no test at all, not a wrong one.** The
   OAuth callback, refresh-rotation, and logout views had never been
   tested — every existing auth test started from an already-issued
   token. Nothing was failing; the gap was only visible by asking
   "where's the test that issues one" and finding no answer. Fixed by
   adding nine tests and confirming the rotation/blacklist one actually
   catches a real regression (temporarily no-opped `.blacklist()`,
   watched the new test fail, restored it). See DEBUGGING.md #10.

The common thread across all nine: every one of these was invisible
from reading the code (or, in cases 8–9, from a green test run) and
only became visible by running it, or by checking that something
existed to run at all — the test suite, a live request, a screenshot at
the viewport that mattered, a computed contrast ratio instead of an
eyeballed one, a diagram actually rendered instead of proofread, a
question about coverage instead of a trusted pass/fail. That's the
practical argument for the "implement → test → inspect → fix → re-test"
loop over "generate and assume," repeated across five separate passes
on this project (initial build, audit, redesign,
architecture/presentation, OAuth verification) rather than just the
first one.

---

## Prompt 7 — final hardening review before submission

**What I asked for.** A single long brief instructing the model to act
as its own harshest reviewer across every role at once — backend,
frontend, QA, security, DevOps, product, interviewer — with explicit
instructions to *re-read the original assignment and audit the
repository against it directly*, rather than trusting either previous
completion report. I told it not to optimise for telling me the project
was finished, to fix what it found rather than only listing it, and to
verify each fix rather than asserting it. I also asked it to seriously
consider whether a real landing page was worth building, and to produce
a final evidence PDF at the end.

**Why I framed it that way.** The two earlier passes had each ended
with "everything verified". That is exactly the state in which a report
stops being useful — a third pass that started from those reports would
have re-confirmed them. Starting from the brief instead is what turned
up the `frontend/public` bug, which had been invisible to two audits
that both tested Docker in the working tree.

### What it found that I would not have

The single most valuable finding was procedural, not technical: it
tested `docker compose up --build` **from a fresh `git clone`** rather
than from the working directory. That is the one thing an evaluator
does that a developer never does, and it exposed a build that was
broken for every person on earth except me. Nothing in the code looked
wrong; the repository was simply missing a directory that Git cannot
track. See DEBUGGING.md #11.

The rest of the pass followed the same pattern — attack the running
system, not the source:

- 12 real concurrent HTTP bookings fired through Nginx at gunicorn,
  rather than re-reading the locking code.
- A live probe suite (role escalation, cross-creator ownership, token
  tampering, mass assignment, malformed ids) run against the deployed
  stack, which is how the `500` on `DELETE /api/bookings/abc/` and the
  host-books-own-session hole surfaced.
- Every page rendered at three widths and looked at, which is how the
  mobile booking button, the out-of-order bookings list and the clipped
  datetime input surfaced. None of those would fail a test.

### Where I pushed back

**On the capacity limitation.** The README already documented "a
creator can lower capacity below existing bookings" as a deliberate
limitation, with a reasonable-sounding defence. I told the model that
an argument for why a bug is acceptable is not the same as the bug
being acceptable, and that the assignment states the invariant
unconditionally. It agreed, implemented the check, and rewrote the
README entry. I'd rather a limitations list be short and true than long
and self-justifying.

**On the landing page's claims.** My instruction was explicit: no
invented testimonials, logos, ratings, user counts or traction. The
model's first instinct on a marketplace landing page is the shape of a
real company's — and that shape is mostly social proof. What shipped
instead describes only behaviour the code actually has, and DECISIONS.md
#7 maps each claim on the page to the test that backs it. The hero
ornament deliberately shows no number, because a number would be a
claim.

**On the first mobile fix.** It moved the booking panel to the top of
the session page, which technically solved "the CTA is below the fold"
and created a worse problem — being asked to book something before
being told its name. I rejected that and it re-did the layout with
explicit per-breakpoint placement. Worth recording: the model optimised
the metric it had been given rather than the experience, which is a
failure mode to watch for whenever you state a UI problem as a rule.

**On adding dependencies.** WhiteNoise was the one new package accepted
this pass, because the Django admin was genuinely rendering unstyled
behind Nginx with `DEBUG=False` and nothing had run `collectstatic`.
`django-filter` went the other way — it was in `INSTALLED_APPS` with a
`filterset_fields = []` that no filter backend ever read. Dead
configuration that looks like a feature is worse than no feature, so it
was removed and replaced with search that actually works.

### What I still checked myself

- That the fresh-clone Docker build genuinely failed before the fix and
  genuinely passes after it — I ran both.
- That the concurrency test can actually fail: `select_for_update()`
  was removed on purpose, the race tests were re-run (a capacity-1
  session sold 6 and then 9 seats), and the lock was restored. A
  passing test proves nothing until you have watched it fail.
- That no secret is in the repository or its history, and that `.env`
  is ignored.
- Every screenshot in the evidence report is a real page from the real
  running stack. Nothing was mocked, and no "successful" state was
  staged that the app doesn't actually produce.

**The honest summary of AI's role here:** it was very good at breadth
and at the mechanical discipline of verification — running the same
check from a different starting point, doing the revert-and-reconfirm
experiment, probing twenty endpoints instead of the three I'd have
thought of. It was weak exactly where taste is required: it needed to
be told that a landing page without social proof is better than one
with invented social proof, and it needed to be told that its first
mobile fix had traded one bad experience for another.

---

## Prompt 8 — documentation rewrite, logo, and final polish

**What I asked for.** A final pass covering four things at once: rewrite the documentation to read like a normal engineer wrote it rather than an audit report, design a real logo (the current "logo" was just italic text — no mark), add a GitHub link to the site, and run the full verification again after. Explicitly ruled out: Google OAuth, and any other new feature. The instruction was blunt about scope: polish and reliability over feature count.

**Documentation.** README.md was rewritten from scratch to the structure I gave — one-sentence description, key features, preview, architecture, stack, auth, booking correctness, setup, tests, limitations — cut from 435 lines to about 300, mostly by removing the meta-commentary about previous audit passes ("two deliberately skeptical audit passes were run...") that had crept in from earlier prompts and reads as the tool describing its own diligence rather than describing the product. DECISIONS.md and DEBUGGING.md were left mostly as they were: on review, both already matched the Problem/Options/Decision/Trade-off and Symptom/Diagnosis/Root-cause/Fix/Verification structure I'd asked for, and rewriting accurate, well-organized content for tone alone risked introducing an error for no real gain. I added one new entry to each — the logo decision, and this entry — rather than touching what already worked.

**The logo.** The brief was specific about what to avoid: no generic sparkle icon, no gradient, nothing that looks like a stock SaaS mark. What it built is a small grid of four seats with one filled in — the same shape already used as decoration on the landing hero — so the mark and the page's existing visual language are the same idea instead of two unrelated pieces. I like this: it's tied to what the product actually does (you book one of the seats) rather than being an arbitrary pictogram, and it was checked at actual favicon size (16px, 32px) before being shipped as the site icon, not just eyeballed at the size it was designed at.

**GitHub link.** Added to the footer only, as instructed — not in the navbar, to avoid cluttering it.

**Verification after the changes.** Full backend suite (69 tests), Django checks, frontend lint/typecheck/build, and a Docker rebuild were all re-run after the branding and doc changes, not assumed to still pass. Results are in the final report below.

**What I'd flag rather than call fully resolved:** the README is more scannable than before, but a "2–3 minute read" is optimistic for a document that still carries two Mermaid diagrams and a full concurrency explanation — I chose to keep those over cutting further, on the basis that the concurrency section is the strongest technical argument in the whole submission and trimming it to hit a time target would be the wrong trade.
