"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { bookingsApi } from "@/lib/api";
import type { Booking } from "@/lib/types";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useRequireAuth } from "@/lib/use-require-auth";
import { ApiError } from "@/lib/api-client";
import { Badge, Card, Alert, EmptyState, PageSpinner } from "@/components/ui/Surfaces";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";

function statusBadge(booking: Booking) {
  if (booking.status === "cancelled") return <Badge tone="error">Cancelled</Badge>;
  if (booking.is_past) return <Badge tone="neutral">Completed</Badge>;
  return <Badge tone="success">Upcoming</Badge>;
}

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

  if (status !== "authenticated") return <PageSpinner label="Loading" />;

  return (
    <div className="space-y-6 animate-fade-up">
      <h1 className="font-display text-2xl text-ink">My bookings</h1>

      <Tabs
        tabs={[
          { value: "active", label: "Upcoming" },
          { value: "past", label: "Past & cancelled" },
        ]}
        value={tab}
        onChange={(v) => setTab(v as "active" | "past")}
      />

      {error && <Alert>{error}</Alert>}
      {!error && bookings === null && <PageSpinner label="Loading bookings" />}
      {bookings && bookings.length === 0 && (
        <EmptyState
          title={tab === "active" ? "No upcoming bookings" : "No past bookings yet"}
          description={tab === "active" ? "Browse the catalog to book a session." : undefined}
          action={
            tab === "active" ? (
              <Link href="/">
                <Button variant="secondary" size="sm">Browse sessions</Button>
              </Link>
            ) : undefined
          }
        />
      )}

      <div className="space-y-3">
        {bookings?.map((booking) => (
          <Card key={booking.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted">
                {formatDateTime(booking.session.start_time)} · {formatDuration(booking.session.duration_minutes)}
              </p>
              <Link
                href={`/sessions/${booking.session.id}`}
                className="mt-1 block font-display text-[17px] text-ink hover:text-accent transition-colors duration-[var(--duration-fast)] truncate"
              >
                {booking.session.title}
              </Link>
              <p className="text-[13px] text-muted mt-0.5">Hosted by {booking.session.creator_username}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {statusBadge(booking)}
              {booking.status === "active" && !booking.is_past && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleCancel(booking.id)}
                  loading={cancellingId === booking.id}
                >
                  Cancel
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
