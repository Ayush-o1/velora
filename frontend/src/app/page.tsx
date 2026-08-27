"use client";

import { useEffect, useState } from "react";
import { sessionsApi } from "@/lib/api";
import type { SessionItem } from "@/lib/types";
import { SessionCard } from "@/components/SessionCard";
import { SessionCardSkeleton } from "@/components/ui/Skeleton";
import { Alert, EmptyState } from "@/components/ui/Surfaces";
import { ApiError } from "@/lib/api-client";

export default function CatalogPage() {
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    sessionsApi
      .list({ upcoming: true })
      .then((data) => {
        if (!cancelled) setSessions(data.results);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load sessions.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-12">
      <div className="max-w-xl animate-fade-up">
        <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-accent">Browse</p>
        <h1 className="mt-2 font-display text-[32px] sm:text-[40px] leading-[1.1] text-ink text-balance">
          Sessions worth clearing your calendar for.
        </h1>
        <p className="mt-3 text-[15px] text-ink-secondary leading-relaxed">
          Small, live, and hosted by people who actually do the work. Book a seat, or become a
          creator and host your own.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      {!error && sessions === null && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <SessionCardSkeleton key={i} />
          ))}
        </div>
      )}

      {sessions && sessions.length === 0 && (
        <EmptyState
          title="No sessions yet"
          description="Check back soon, or sign in as a creator to host the first one."
        />
      )}

      {sessions && sessions.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session, i) => (
            <div key={session.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
              <SessionCard session={session} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
