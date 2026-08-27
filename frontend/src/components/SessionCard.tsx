import Link from "next/link";
import type { SessionItem } from "@/lib/types";
import { formatDateTime, formatDuration } from "@/lib/format";
import { Badge, Card } from "./ui";

export function SessionCard({ session }: { session: SessionItem }) {
  const full = session.seats_remaining <= 0;

  return (
    <Link href={`/sessions/${session.id}`}>
      <Card className="hover:border-brand transition-colors h-full flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-neutral-900">{session.title}</h3>
          {session.has_started ? (
            <Badge tone="neutral">Started</Badge>
          ) : full ? (
            <Badge tone="red">Full</Badge>
          ) : (
            <Badge tone="green">{session.seats_remaining} left</Badge>
          )}
        </div>
        <p className="text-sm text-neutral-500 line-clamp-2">{session.description}</p>
        <div className="mt-auto text-sm text-neutral-600 space-y-1">
          <p>{formatDateTime(session.start_time)} · {formatDuration(session.duration_minutes)}</p>
          {session.location && <p className="text-neutral-500">{session.location}</p>}
          <p className="text-neutral-500">Hosted by {session.creator.username}</p>
        </div>
      </Card>
    </Link>
  );
}
