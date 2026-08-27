"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { sessionsApi } from "@/lib/api";
import type { SessionItem } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { SessionCard } from "@/components/SessionCard";
import { SessionCardSkeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero({ isCreator }: { isCreator: boolean }) {
  return (
    <section className="relative overflow-hidden pt-6 pb-14 sm:pt-12 sm:pb-20">
      {/* A single soft wash behind the headline — enough to give the page a
          focal point without becoming the purple-gradient hero every
          template ships with. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-accent-soft/60 blur-3xl"
      />

      <div className="relative max-w-3xl animate-fade-up">
        <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-accent">
          Live sessions · Small rooms
        </p>

        <h1 className="mt-4 font-display text-[40px] leading-[1.06] tracking-[-0.01em] text-ink text-balance sm:text-[58px]">
          Book a seat in the room where{" "}
          <span className="italic">the work actually happens.</span>
        </h1>

        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-secondary">
          Velora is a small marketplace for live sessions — workshops, deep dives, office hours.
          Creators publish a time and a seat count. You take one of the seats. That&apos;s the
          whole product.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href="/sessions">
            <Button size="md" className="w-full sm:w-auto px-6">
              Browse sessions
            </Button>
          </Link>
          <Link href={isCreator ? "/creator/sessions/new" : "/profile"}>
            <Button variant="secondary" size="md" className="w-full sm:w-auto px-6">
              {isCreator ? "Host a session" : "Become a creator"}
            </Button>
          </Link>
        </div>

        <p className="mt-6 text-[13px] text-muted">
          Sign in with GitHub — no password to create, none to forget.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* How it works                                                        */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    n: "01",
    title: "Find a session",
    body: "Browse what's coming up. Every card shows the real number of seats left, the host, and when it starts — before you sign in.",
  },
  {
    n: "02",
    title: "Take a seat",
    body: "One click books you in. If two people go for the last seat at the same moment, exactly one of you gets it — decided in the database, not by whoever's page refreshed first.",
  },
  {
    n: "03",
    title: "Show up, or change your mind",
    body: "Your bookings live in one place, split into upcoming and past. Cancel any time before the session starts and the seat goes straight back to the room.",
  },
];

function HowItWorks() {
  return (
    <section className="border-t border-border py-14 sm:py-20">
      <h2 className="font-display text-[26px] leading-tight text-ink sm:text-[32px]">
        How it works
      </h2>

      <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.n}>
            <p className="font-display text-[13px] tracking-[0.14em] text-accent">{step.n}</p>
            <h3 className="mt-3 font-display text-[19px] text-ink">{step.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-secondary">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Live catalog preview                                                */
/* ------------------------------------------------------------------ */

function HappeningSoon() {
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    sessionsApi
      .list({ upcoming: true })
      .then((data) => {
        if (!cancelled) setSessions(data.results.slice(0, 3));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The landing page is a shopfront, not a status board: if the catalog
  // can't be reached, the section simply steps aside rather than putting
  // an error banner in front of a first-time visitor.
  if (failed) return null;

  return (
    <section className="border-t border-border py-14 sm:py-20">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h2 className="font-display text-[26px] leading-tight text-ink sm:text-[32px]">
            Happening soon
          </h2>
          <p className="mt-2 text-[15px] text-ink-secondary">
            Straight from the live catalog — no auth required to look.
          </p>
        </div>
        <Link
          href="/sessions"
          className="hidden shrink-0 text-[14px] text-accent underline underline-offset-4 hover:text-accent-hover sm:block"
        >
          See all
        </Link>
      </div>

      <div className="mt-8">
        {sessions === null ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <SessionCardSkeleton key={i} />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-border-strong bg-surface/60 px-6 py-12 text-center">
            <p className="font-display text-lg text-ink">Nothing on the calendar yet</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
              This instance is brand new. Become a creator and the first session on Velora can be
              yours.
            </p>
            <div className="mt-5">
              <Link href="/profile">
                <Button variant="secondary" size="sm">
                  Become a creator
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-7 sm:hidden">
        <Link href="/sessions">
          <Button variant="secondary" size="sm" className="w-full">
            See all sessions
          </Button>
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* For hosts                                                           */
/* ------------------------------------------------------------------ */

function ForHosts({ isCreator }: { isCreator: boolean }) {
  return (
    <section className="border-t border-border py-14 sm:py-20">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-accent">
            For hosts
          </p>
          <h2 className="mt-3 font-display text-[26px] leading-tight text-ink sm:text-[32px] text-balance">
            Set a time, set a seat count, and stop counting by hand.
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-ink-secondary">
            Any account can become a creator from its profile — there&apos;s no waitlist and no
            application. Publish a session, and the dashboard tracks how many of your seats are
            taken while it fills.
          </p>
          <div className="mt-7">
            <Link href={isCreator ? "/creator/dashboard" : "/profile"}>
              <Button variant="secondary" size="md" className="px-6">
                {isCreator ? "Open your dashboard" : "Become a creator"}
              </Button>
            </Link>
          </div>
        </div>

        <ul className="space-y-5 lg:pt-11">
          {[
            ["Your sessions, only yours", "Editing and deleting are checked against ownership on the server, so another creator can't touch your listing even with the right URL."],
            ["Live booking counts", "The dashboard shows seats taken against capacity for every session you host, updated from the same numbers attendees see."],
            ["Capacity that holds", "You can raise a seat count any time. Lowering it below the people already booked is refused — nobody loses a confirmed seat by accident."],
          ].map(([title, body]) => (
            <li key={title} className="border-l-2 border-accent-soft pl-4">
              <p className="text-[15px] font-medium text-ink">{title}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-ink-secondary">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Closing CTA                                                         */
/* ------------------------------------------------------------------ */

function ClosingCta() {
  return (
    <section className="border-t border-border py-14 sm:py-20">
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-7 py-12 text-center sm:px-12 sm:py-16">
        <h2 className="mx-auto max-w-lg font-display text-[26px] leading-tight text-ink sm:text-[32px] text-balance">
          There&apos;s a seat with your name on it.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-ink-secondary">
          Browsing is open to everyone. You only need an account when you want to hold a seat.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/sessions">
            <Button size="md" className="w-full sm:w-auto px-6">
              Browse sessions
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary" size="md" className="w-full sm:w-auto px-6">
              Sign in with GitHub
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const { user } = useAuth();
  const isCreator = user?.role === "creator";

  return (
    <div className="-mt-10">
      <Hero isCreator={isCreator} />
      <HowItWorks />
      <HappeningSoon />
      <ForHosts isCreator={isCreator} />
      <ClosingCta />
    </div>
  );
}
