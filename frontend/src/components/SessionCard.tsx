import Link from "next/link";
import type { SessionItem } from "@/lib/types";
import { formatCardDateline, formatDuration } from "@/lib/format";
import { Avatar } from "@/components/ui/Surfaces";
import { Card } from "@/components/ui/Surfaces";

function Availability({ session }: { session: SessionItem }) {
  if (session.has_started) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-muted" />
        Started
      </span>
    );
  }
  if (session.seats_remaining <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-error">
        <span className="h-1.5 w-1.5 rounded-full bg-error" />
        Full
      </span>
    );
  }
  const nearlyFull = session.seats_remaining <= Math.max(1, Math.ceil(session.capacity * 0.2));
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] ${nearlyFull ? "text-warning" : "text-success"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${nearlyFull ? "bg-warning" : "bg-success"}`} />
      {session.seats_remaining} of {session.capacity} spots
    </span>
  );
}

export function SessionCard({ session }: { session: SessionItem }) {
  return (
    <Link href={`/sessions/${session.id}`} className="block h-full group">
      <Card interactive className="h-full flex flex-col gap-3.5 p-5">
        <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-accent">
          {formatCardDateline(session.start_time)}
        </p>

        <h3 className="font-display text-[19px] leading-snug text-ink group-hover:text-accent transition-colors duration-[var(--duration-fast)]">
          {session.title}
        </h3>

        <div className="flex items-center gap-2 text-[13px] text-ink-secondary">
          <Avatar name={session.creator.username} src={session.creator.avatar_url} size={20} />
          <span>{session.creator.username}</span>
          {session.location && (
            <>
              <span className="text-border-strong">·</span>
              <span className="truncate">{session.location}</span>
            </>
          )}
        </div>

        {session.description && (
          <p className="text-[14px] leading-relaxed text-ink-secondary line-clamp-2">{session.description}</p>
        )}

        <div className="mt-auto pt-3.5 border-t border-border flex items-center justify-between">
          <span className="text-[13px] text-muted">{formatDuration(session.duration_minutes)}</span>
          <Availability session={session} />
        </div>
      </Card>
    </Link>
  );
}
