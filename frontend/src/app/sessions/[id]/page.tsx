"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { bookingsApi, sessionsApi } from "@/lib/api";
import type { SessionItem } from "@/lib/types";
import { formatDateTime, formatDuration, formatRelativeToNow } from "@/lib/format";
import { Avatar, Alert, Badge, Card, PageSpinner } from "@/components/ui/Surfaces";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-right text-[14px] text-ink">{value}</span>
    </div>
  );
}

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, status } = useAuth();

  const [session, setSession] = useState<SessionItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [justBooked, setJustBooked] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const load = useCallback(() => {
    sessionsApi
      .retrieve(params.id)
      .then(setSession)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "Could not load this session.")
      );
  }, [params.id]);

  // Re-fetch once auth resolves: `viewer_has_booked` is computed per
  // requesting user, so the anonymous first response would otherwise leave
  // an already-booked user looking at a live "Book this session" button.
  useEffect(() => {
    if (status !== "loading") load();
  }, [status, load]);

  const handleBook = async () => {
    if (status !== "authenticated") {
      router.push("/login");
      return;
    }
    setBooking(true);
    setBookingError(null);
    try {
      await bookingsApi.create(Number(params.id));
      setJustBooked(true);
      load();
    } catch (err) {
      setBookingError(
        err instanceof ApiError ? err.message : "Could not complete booking. Please try again."
      );
      // The failure reasons are all server-side facts (someone took the
      // last seat, the session started) — refetching turns a stale page
      // into an accurate one instead of leaving a dead button.
      load();
    } finally {
      setBooking(false);
    }
  };

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!session) return <PageSpinner label="Loading session" />;

  const full = session.seats_remaining <= 0;
  const isHost = user?.id === session.creator.id;
  const alreadyBooked = session.viewer_has_booked;
  const canBook =
    !session.has_started && !full && !isHost && !alreadyBooked && status !== "loading";

  let ctaLabel = "Book this session";
  if (session.has_started) ctaLabel = "Session already started";
  else if (full) ctaLabel = "Session full";
  else if (status !== "authenticated") ctaLabel = "Sign in to book";

  let statusBadge = null;
  if (session.has_started) statusBadge = <Badge tone="neutral">Started</Badge>;
  else if (alreadyBooked) statusBadge = <Badge tone="success">You&apos;re booked</Badge>;
  else if (full) statusBadge = <Badge tone="error">Full</Badge>;

  return (
    <div className="animate-fade-up">
      <Link
        href="/sessions"
        className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink-secondary"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M8.5 3 4.5 7l4 4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        All sessions
      </Link>

      {/* The aside is source-ordered second for reading order, but pulled
          above the description on small screens: on a phone the booking
          panel was otherwise below the entire body copy, so the primary
          action on the page required scrolling past everything. */}
      <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-10">
        <div className="order-2 min-w-0 lg:order-1">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-accent">
              {formatRelativeToNow(session.start_time)}
            </p>
            {statusBadge}
          </div>

          <h1 className="mt-2 font-display text-[30px] leading-[1.12] text-ink text-balance sm:text-[36px]">
            {session.title}
          </h1>

          <div className="mt-5 flex items-center gap-2.5">
            <Avatar name={session.creator.username} src={session.creator.avatar_url} size={32} />
            <div className="text-[14px]">
              <p className="text-ink">{session.creator.username}</p>
              <p className="text-[13px] text-muted">Host</p>
            </div>
          </div>

          {session.description && (
            <div className="mt-8 border-t border-border pt-8">
              <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.06em] text-muted">
                About
              </h2>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-secondary">
                {session.description}
              </p>
            </div>
          )}
        </div>

        <aside className="order-1 h-fit lg:order-2 lg:sticky lg:top-24">
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
              {isHost ? (
                <>
                  <p className="text-[13px] text-muted">
                    You&apos;re hosting this session, so there&apos;s no seat to book.
                  </p>
                  <Link href={`/creator/sessions/${session.id}/edit`} className="block">
                    <Button variant="secondary" className="w-full">
                      Edit session
                    </Button>
                  </Link>
                </>
              ) : alreadyBooked ? (
                <>
                  <Alert tone="success">
                    {justBooked ? "You're booked in." : "You already have a seat in this session."}
                  </Alert>
                  <Link href="/bookings" className="block">
                    <Button variant="secondary" className="w-full">
                      View in my bookings
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  {bookingError && <Alert>{bookingError}</Alert>}
                  <Button
                    onClick={handleBook}
                    disabled={!canBook}
                    loading={booking}
                    className="w-full"
                  >
                    {ctaLabel}
                  </Button>
                  {status === "unauthenticated" && !full && !session.has_started && (
                    <p className="text-center text-[13px] text-muted">
                      Takes one GitHub sign-in — nothing else to fill in.
                    </p>
                  )}
                </>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
