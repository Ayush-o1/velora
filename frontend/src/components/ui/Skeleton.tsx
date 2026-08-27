export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-[var(--radius-sm)] ${className}`} aria-hidden="true" />;
}

export function SessionCardSkeleton() {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-5 w-3/5" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <div className="flex items-center gap-2 pt-2">
        <Skeleton className="h-7 w-7 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}
