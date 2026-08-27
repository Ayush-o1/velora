"use client";

import { useEffect, useState } from "react";
import { sessionsApi } from "@/lib/api";
import type { SessionItem } from "@/lib/types";
import { SessionCard } from "@/components/SessionCard";
import { SessionCardSkeleton } from "@/components/ui/Skeleton";
import { Alert, EmptyState } from "@/components/ui/Surfaces";
import { ApiError } from "@/lib/api-client";

export default function CatalogPage() {
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  // Result is stored together with the query it belongs to. Loading is
  // then *derived* — "the result I'm holding isn't for the query I'm
  // asking" — instead of being a third state written synchronously from
  // the effect body, which is what React now warns about (and what makes
  // a stale response able to overwrite a newer one).
  const [result, setResult] = useState<{
    query: string | null;
    sessions: SessionItem[] | null;
    error: string | null;
  }>({ query: null, sessions: null, error: null });

  // Debounced so typing doesn't fire a request per keystroke. Search is
  // resolved server-side (title, description, location, host) rather than
  // by filtering an already-fetched page, which would silently miss
  // anything past the first 20 results.
  useEffect(() => {
    const id = setTimeout(() => setActiveQuery(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    sessionsApi
      .list({ upcoming: true, search: activeQuery || undefined })
      .then((data) => {
        if (!cancelled) setResult({ query: activeQuery, sessions: data.results, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({
          query: activeQuery,
          sessions: null,
          error: err instanceof ApiError ? err.message : "Could not load sessions.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeQuery]);

  const loading = result.query !== activeQuery;
  const sessions = loading ? null : result.sessions;
  const error = loading ? null : result.error;
  const searching = activeQuery.length > 0;

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl animate-fade-up">
          <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-accent">Browse</p>
          <h1 className="mt-2 font-display text-[32px] sm:text-[40px] leading-[1.1] text-ink text-balance">
            Sessions worth clearing your calendar for.
          </h1>
          <p className="mt-3 text-[15px] text-ink-secondary leading-relaxed">
            Small, live, and hosted by people who actually do the work. Every seat count below is
            real — capacity is enforced by the database, not by hiding a button.
          </p>
        </div>

        <div className="w-full lg:w-[300px] shrink-0">
          <label htmlFor="session-search" className="sr-only">
            Search sessions
          </label>
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              id="session-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by topic, host, or place"
              className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface py-2.5 pl-9 pr-3.5 text-[14px] text-ink placeholder:text-muted transition-colors duration-[var(--duration-fast)] hover:border-ink-secondary/40 focus:border-accent focus:outline-none"
            />
          </div>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {!error && sessions === null && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <SessionCardSkeleton key={i} />
          ))}
        </div>
      )}

      <div aria-live="polite" className="space-y-10">
        {sessions && sessions.length === 0 && (
          <EmptyState
            title={searching ? `Nothing matches “${activeQuery}”` : "No upcoming sessions yet"}
            description={
              searching
                ? "Try a broader term, or clear the search to see everything coming up."
                : "Check back soon, or sign in and become a creator to host the first one."
            }
          />
        )}

        {sessions && sessions.length > 0 && (
          <>
            {searching && (
              <p className="text-[13px] text-muted">
                {sessions.length} {sessions.length === 1 ? "session" : "sessions"} matching “
                {activeQuery}”
              </p>
            )}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {sessions.map((session, i) => (
                <div
                  key={session.id}
                  className="animate-fade-up"
                  style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                >
                  <SessionCard session={session} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
