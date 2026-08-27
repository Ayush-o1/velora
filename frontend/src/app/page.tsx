"use client";

import { useEffect, useState } from "react";
import { sessionsApi } from "@/lib/api";
import type { SessionItem } from "@/lib/types";
import { SessionCard } from "@/components/SessionCard";
import { EmptyState, ErrorBanner, LoadingSpinner } from "@/components/ui";
import { ApiError } from "@/lib/api-client";

export default function CatalogPage() {
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    sessionsApi
      .list()
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Browse sessions</h1>
        <p className="text-neutral-500 mt-1">Live sessions hosted by creators on Velora.</p>
      </div>

      {error && <ErrorBanner message={error} />}
      {!error && sessions === null && <LoadingSpinner />}
      {sessions && sessions.length === 0 && (
        <EmptyState title="No sessions yet" description="Check back soon, or sign in as a creator to host one." />
      )}
      {sessions && sessions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
