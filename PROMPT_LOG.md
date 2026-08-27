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

Both were caught by running the test suite the agent itself had just
written, not by inspection alone — which is the point of the
"implement → test → inspect → fix → re-test" loop the brief required
rather than a "generate and assume" workflow.
