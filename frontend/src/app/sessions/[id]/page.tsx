"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { bookingsApi, sessionsApi } from "@/lib/api";
import type { SessionItem } from "@/lib/types";
import { formatDateTime, formatDuration } from "@/lib/format";
import { Avatar, Alert, Card, PageSpinner } from "@/components/ui/Surfaces";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[14px] text-ink text-right">{value}</span>
    </div>
  );
}

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
      setBookingError(err instanceof ApiError ? err.message : "Could not complete booking. Please try again.");
    }
  };

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!session) return <PageSpinner label="Loading session" />;

  const full = session.seats_remaining <= 0;
  const isOwnSession = user?.id === session.creator.id;
  const canBook = !session.has_started && !full && !isOwnSession && bookingState !== "booked";

  let ctaLabel = "Book this session";
  if (status !== "authenticated") ctaLabel = "Sign in to book";
  else if (bookingState === "booking") ctaLabel = "Booking…";
  else if (session.has_started) ctaLabel = "Session already started";
  else if (full) ctaLabel = "Session full";

  return (
    <div className="animate-fade-up">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink-secondary mb-8">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M8.5 3 4.5 7l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Browse
      </Link>

      <div className="grid lg:grid-cols-[1fr_320px] gap-10">
        <div className="min-w-0">
          <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-accent">
            {formatDateTime(session.start_time)}
          </p>
          <h1 className="mt-2 font-display text-[30px] sm:text-[36px] leading-[1.12] text-ink text-balance">
            {session.title}
          </h1>

          <div className="mt-5 flex items-center gap-2.5">
            <Avatar name={session.creator.username} src={session.creator.avatar_url} size={32} />
            <div className="text-[14px]">
              <p className="text-ink">{session.creator.username}</p>
              <p className="text-muted text-[13px]">Host</p>
            </div>
          </div>

          {session.description && (
            <div className="mt-8 pt-8 border-t border-border">
              <h2 className="text-[13px] font-medium uppercase tracking-[0.06em] text-muted mb-3">About</h2>
              <p className="text-[15px] leading-relaxed text-ink-secondary whitespace-pre-line">
                {session.description}
              </p>
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 h-fit">
          <Card className="p-5">
            <div className="divide-y divide-border">
              <InfoRow label="When" value={formatDateTime(session.start_time)} />
              <InfoRow label="Duration" value={formatDuration(session.duration_minutes)} />
              {session.location && <InfoRow label="Where" value={session.location} />}
              <InfoRow
                label="Seats"
                value={full ? "Full" : `${session.seats_remaining} of ${session.capacity} left`}
              />
            </div>

            <div className="mt-5 space-y-3">
              {isOwnSession && (
                <p className="text-[13px] text-muted">This is your own session — creators don&apos;t book their own sessions.</p>
              )}

              {bookingState === "booked" && (
                <Alert tone="success">
                  You&apos;re booked in. Find it under{" "}
                  <Link href="/bookings" className="underline underline-offset-2">
                    My Bookings
                  </Link>
                  .
                </Alert>
              )}

              {bookingError && <Alert>{bookingError}</Alert>}

              {!isOwnSession && bookingState !== "booked" && (
                <Button onClick={handleBook} disabled={!canBook} loading={bookingState === "booking"} className="w-full">
                  {ctaLabel}
                </Button>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
