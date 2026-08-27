"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { sessionsApi } from "@/lib/api";
import type { SessionItem } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { useRequireAuth } from "@/lib/use-require-auth";
import { ApiError } from "@/lib/api-client";
import { Badge, Button, Card, EmptyState, ErrorBanner, LoadingSpinner } from "@/components/ui";

export default function CreatorDashboardPage() {
  const { status } = useRequireAuth("creator");
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = () => {
    sessionsApi
      .mine()
      .then((data) => setSessions(data.results))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your sessions."));
  };

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this session? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await sessionsApi.remove(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete session.");
    } finally {
      setDeletingId(null);
    }
  };

  if (status !== "authenticated") return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Your sessions</h1>
        <Link href="/creator/sessions/new">
          <Button>New session</Button>
        </Link>
      </div>

      {error && <ErrorBanner message={error} />}
      {!error && sessions === null && <LoadingSpinner />}
      {sessions && sessions.length === 0 && (
        <EmptyState title="No sessions yet" description="Create your first session to start taking bookings." />
      )}

      <div className="space-y-3">
        {sessions?.map((session) => (
          <Card key={session.id} className="flex items-center justify-between gap-4">
            <div>
              <Link href={`/sessions/${session.id}`} className="font-medium text-neutral-900 hover:underline">
                {session.title}
              </Link>
              <p className="text-sm text-neutral-500">{formatDateTime(session.start_time)}</p>
              <p className="text-sm text-neutral-500">
                {session.seats_taken} / {session.capacity} booked
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {session.has_started && <Badge tone="neutral">Started</Badge>}
              <Link href={`/creator/sessions/${session.id}/edit`}>
                <Button variant="secondary">Edit</Button>
              </Link>
              <Button variant="danger" onClick={() => handleDelete(session.id)} disabled={deletingId === session.id}>
                {deletingId === session.id ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
