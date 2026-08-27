"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { bookingsApi, sessionsApi } from "@/lib/api";
import type { SessionItem } from "@/lib/types";
import { formatDateTime, formatDuration } from "@/lib/format";
import { Badge, Button, Card, ErrorBanner, LoadingSpinner } from "@/components/ui";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, status } = useAuth();

  const [session, setSession] = useState<SessionItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bookingState, setBookingState] = useState<"idle" | "booking" | "booked" | "error">("idle");
  const [bookingError, setBookingError] = useState<string | null>(null);

  const load = () => {
    sessionsApi
      .retrieve(params.id)
      .then(setSession)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load this session."));
  };

  useEffect(load, [params.id]);

  const handleBook = async () => {
    if (status !== "authenticated") {
      router.push("/login");
      return;
    }
    setBookingState("booking");
    setBookingError(null);
    try {
      await bookingsApi.create(Number(params.id));
      setBookingState("booked");
      load();
    } catch (err) {
      setBookingState("error");
      if (err instanceof ApiError) {
        setBookingError(err.message);
      } else {
        setBookingError("Could not complete booking. Please try again.");
      }
    }
  };

  if (loadError) return <ErrorBanner message={loadError} />;
  if (!session) return <LoadingSpinner />;

  const full = session.seats_remaining <= 0;
  const isOwnSession = user?.id === session.creator.id;
  const canBook = !session.has_started && !full && !isOwnSession;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold text-neutral-900">{session.title}</h1>
          {session.has_started ? (
            <Badge tone="neutral">Started</Badge>
          ) : full ? (
            <Badge tone="red">Full</Badge>
          ) : (
            <Badge tone="green">{session.seats_remaining} of {session.capacity} left</Badge>
          )}
        </div>
        <p className="text-neutral-500 mt-1">Hosted by {session.creator.username}</p>
      </div>

      <Card className="space-y-2 text-sm text-neutral-700">
        <p><span className="font-medium text-neutral-900">When: </span>{formatDateTime(session.start_time)} · {formatDuration(session.duration_minutes)}</p>
        {session.location && <p><span className="font-medium text-neutral-900">Where: </span>{session.location}</p>}
        <p><span className="font-medium text-neutral-900">Capacity: </span>{session.capacity} seats</p>
      </Card>

      {session.description && (
        <div>
          <h2 className="font-medium text-neutral-900 mb-1">About this session</h2>
          <p className="text-neutral-600 whitespace-pre-line">{session.description}</p>
        </div>
      )}

      <div className="space-y-3">
        {isOwnSession && <p className="text-sm text-neutral-500">This is your own session — creators don&apos;t book their own sessions.</p>}
        {bookingState === "booked" && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">
            You&apos;re booked in. Find it under <a href="/bookings" className="underline">My Bookings</a>.
          </p>
        )}
        {bookingError && <ErrorBanner message={bookingError} />}
        {!isOwnSession && bookingState !== "booked" && (
          <Button onClick={handleBook} disabled={!canBook || bookingState === "booking"}>
            {status !== "authenticated"
              ? "Sign in to book"
              : bookingState === "booking"
                ? "Booking…"
                : session.has_started
                  ? "Session already started"
                  : full
                    ? "Session full"
                    : "Book this session"}
          </Button>
        )}
      </div>
    </div>
  );
}
