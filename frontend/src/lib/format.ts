export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Compact, editorial-style dateline for cards: "SAT, AUG 29 · 9:12 PM" */
export function formatCardDateline(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timePart = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * "In 3 days", "Tomorrow", "In 2 hours" — used as the session page's
 * eyebrow so it isn't just a second copy of the absolute timestamp
 * already sitting in the booking panel two inches away.
 */
export function formatRelativeToNow(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "Already started";

  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return minutes <= 1 ? "Starting now" : `In ${minutes} minutes`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "In an hour" : `In ${hours} hours`;

  const days = Math.round(hours / 24);
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;

  const weeks = Math.round(days / 7);
  return weeks === 1 ? "In a week" : `In ${weeks} weeks`;
}
