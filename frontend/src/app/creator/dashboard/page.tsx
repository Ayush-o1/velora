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

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="font-display text-[26px] leading-none text-ink">{value}</p>
      <p className="mt-1.5 text-[13px] text-muted">{label}</p>
    </div>
  );
}

export default function CreatorDashboardPage() {
  const { status } = useRequireAuth("creator");
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<SessionItem | null>(null);

  const load = () => {
    sessionsApi
      .mine()
      .then((data) => setSessions(data.results))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Could not load your sessions.")
      );
  };

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status]);

  const handleDelete = async () => {
    if (!confirmTarget) return;
    setDeleting(true);
    try {
      await sessionsApi.remove(confirmTarget.id);
      setConfirmTarget(null);
      load();
    } catch (err) {
      setConfirmTarget(null);
      setError(err instanceof ApiError ? err.message : "Could not delete session.");
    } finally {
      setDeleting(false);
    }
  };

  if (status !== "authenticated") return <PageSpinner label="Loading" />;

  const upcoming = sessions?.filter((s) => !s.has_started) ?? [];
  const seatsBooked = sessions?.reduce((total, s) => total + s.seats_taken, 0) ?? 0;

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">Your sessions</h1>
          <p className="mt-1 text-[14px] text-ink-secondary">
            Everything you host, and how full it is.
          </p>
        </div>
        <Link href="/creator/sessions/new">
          <Button>New session</Button>
        </Link>
      </div>

      {sessions && sessions.length > 0 && (
        <Card className="grid grid-cols-3 gap-4 px-6 py-5">
          <SummaryStat label="Sessions hosted" value={sessions.length} />
          <SummaryStat label="Still upcoming" value={upcoming.length} />
          <SummaryStat label="Seats booked" value={seatsBooked} />
        </Card>
      )}

      {error && <Alert>{error}</Alert>}
      {!error && sessions === null && <PageSpinner label="Loading sessions" />}
      {sessions && sessions.length === 0 && (
        <EmptyState
          title="No sessions yet"
          description="Create your first session to start taking bookings."
          action={
            <Link href="/creator/sessions/new">
              <Button size="sm">Create a session</Button>
            </Link>
          }
        />
      )}

      <div className="space-y-3">
        {sessions?.map((session) => (
          <Card
            key={session.id}
            className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"
          >
            <div className="min-w-0">
              <Link
                href={`/sessions/${session.id}`}
                className="font-display text-[17px] text-ink transition-colors duration-[var(--duration-fast)] hover:text-accent"
              >
                {session.title}
              </Link>
              <p className="mt-0.5 text-[13px] text-muted">{formatDateTime(session.start_time)}</p>
              <p className="mt-1.5 text-[13px] text-ink-secondary">
                <span className="font-medium text-ink">{session.seats_taken}</span> of{" "}
                {session.capacity} seats booked
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              {session.has_started ? (
                <Badge tone="neutral">Started</Badge>
              ) : session.seats_remaining === 0 ? (
                <Badge tone="success">Full</Badge>
              ) : null}
              <Link href={`/creator/sessions/${session.id}/edit`}>
                <Button variant="secondary" size="sm">
                  Edit
                </Button>
              </Link>
              <Button variant="destructive" size="sm" onClick={() => setConfirmTarget(session)}>
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog
        open={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        title="Delete this session?"
      >
        {confirmTarget && (
          <div className="space-y-3">
            <p>
              <span className="font-medium text-ink">
                &ldquo;{confirmTarget.title}&rdquo;
              </span>{" "}
              will be removed permanently. This can&apos;t be undone.
            </p>
            {confirmTarget.seats_taken > 0 && (
              <Alert>
                {confirmTarget.seats_taken}{" "}
                {confirmTarget.seats_taken === 1 ? "person has" : "people have"} already booked a
                seat. Deleting the session cancels{" "}
                {confirmTarget.seats_taken === 1 ? "their booking" : "their bookings"} too, and
                Velora doesn&apos;t notify them.
              </Alert>
            )}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={() => setConfirmTarget(null)}>
            Keep session
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} loading={deleting}>
            Delete session
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
