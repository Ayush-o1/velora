"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { bookingsApi } from "@/lib/api";
import type { Booking } from "@/lib/types";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useRequireAuth } from "@/lib/use-require-auth";
import { ApiError } from "@/lib/api-client";
import { Badge, Button, Card, EmptyState, ErrorBanner, LoadingSpinner } from "@/components/ui";

export default function BookingsPage() {
  const { status } = useRequireAuth();
  const [tab, setTab] = useState<"active" | "past">("active");
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const load = () => {
    bookingsApi
      .mine(tab)
      .then((data) => setBookings(data.results))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load bookings."));
  };

  useEffect(() => {
    if (status === "authenticated") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tab]);

  const handleCancel = async (id: number) => {
    setCancellingId(id);
    try {
      await bookingsApi.cancel(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel booking.");
    } finally {
      setCancellingId(null);
    }
  };

  if (status !== "authenticated") return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">My bookings</h1>

      <div className="flex gap-2 border-b border-neutral-200">
        {(["active", "past"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t ? "border-brand text-brand" : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {t === "active" ? "Upcoming" : "Past & cancelled"}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} />}
      {!error && bookings === null && <LoadingSpinner />}
      {bookings && bookings.length === 0 && (
        <EmptyState
          title={tab === "active" ? "No upcoming bookings" : "No past bookings yet"}
          description={tab === "active" ? "Browse the catalog to book a session." : undefined}
        />
      )}

      <div className="space-y-3">
        {bookings?.map((booking) => (
          <Card key={booking.id} className="flex items-center justify-between gap-4">
            <div>
              <Link href={`/sessions/${booking.session.id}`} className="font-medium text-neutral-900 hover:underline">
                {booking.session.title}
              </Link>
              <p className="text-sm text-neutral-500">
                {formatDateTime(booking.session.start_time)} · {formatDuration(booking.session.duration_minutes)}
              </p>
              <p className="text-sm text-neutral-500">Hosted by {booking.session.creator_username}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Badge tone={booking.status === "cancelled" ? "red" : booking.is_past ? "neutral" : "green"}>
                {booking.status === "cancelled" ? "Cancelled" : booking.is_past ? "Past" : "Active"}
              </Badge>
              {booking.status === "active" && !booking.is_past && (
                <Button variant="danger" onClick={() => handleCancel(booking.id)} disabled={cancellingId === booking.id}>
                  {cancellingId === booking.id ? "Cancelling…" : "Cancel"}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
