"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { sessionsApi } from "@/lib/api";
import type { SessionItem } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { useRequireAuth } from "@/lib/use-require-auth";
import { ApiError } from "@/lib/api-client";
import { Badge, Card, Alert, EmptyState, PageSpinner } from "@/components/ui/Surfaces";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

export default function CreatorDashboardPage() {
  const { status } = useRequireAuth("creator");
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<SessionItem | null>(null);

  const load = () => {
    sessionsApi
      .mine()
      .then((data) => setSessions(data.results))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your sessions."));
  };

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status]);

  const handleDelete = async () => {
    if (!confirmTarget) return;
    setDeletingId(confirmTarget.id);
    try {
      await sessionsApi.remove(confirmTarget.id);
      setConfirmTarget(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete session.");
    } finally {
      setDeletingId(null);
    }
  };

  if (status !== "authenticated") return <PageSpinner label="Loading" />;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">Your sessions</h1>
        <Link href="/creator/sessions/new">
          <Button>New session</Button>
        </Link>
      </div>

      {error && <Alert>{error}</Alert>}
      {!error && sessions === null && <PageSpinner label="Loading sessions" />}
      {sessions && sessions.length === 0 && (
        <EmptyState title="No sessions yet" description="Create your first session to start taking bookings." />
      )}

      <div className="space-y-3">
        {sessions?.map((session) => (
          <Card key={session.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <Link
                href={`/sessions/${session.id}`}
                className="font-display text-[17px] text-ink hover:text-accent transition-colors duration-[var(--duration-fast)]"
              >
                {session.title}
              </Link>
              <p className="text-[13px] text-muted mt-0.5">{formatDateTime(session.start_time)}</p>
              <p className="text-[13px] text-ink-secondary mt-0.5">
                {session.seats_taken} / {session.capacity} booked
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              {session.has_started && <Badge tone="neutral">Started</Badge>}
              <Link href={`/creator/sessions/${session.id}/edit`}>
                <Button variant="secondary" size="sm">Edit</Button>
              </Link>
              <Button variant="destructive" size="sm" onClick={() => setConfirmTarget(session)}>
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={confirmTarget !== null} onClose={() => setConfirmTarget(null)} title="Delete this session?">
        <p>
          {confirmTarget && (
            <>
              <span className="text-ink font-medium">&ldquo;{confirmTarget.title}&rdquo;</span> will be removed
              permanently, along with its bookings. This can&apos;t be undone.
            </>
          )}
        </p>
        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={() => setConfirmTarget(null)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} loading={deletingId === confirmTarget?.id}>
            Delete session
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
