import type { HTMLAttributes, ReactNode } from "react";

export function Card({
  children,
  className = "",
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={`rounded-[var(--radius-md)] border border-border bg-surface ${
        interactive
          ? "transition-[border-color,box-shadow,transform] duration-[var(--duration-base)] ease-[var(--ease-out)] hover:border-border-strong hover:shadow-[0_8px_24px_-12px_rgba(33,31,26,0.18)] hover:-translate-y-[2px]"
          : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

type BadgeTone = "neutral" | "success" | "warning" | "error" | "accent";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-ink-secondary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  error: "bg-error-soft text-error",
  accent: "bg-accent-soft text-accent",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium tracking-wide ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Avatar({ name, src, size = 36 }: { name: string; src?: string; size?: number }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover border border-border"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-accent-soft font-display text-accent select-none"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success"; children: ReactNode }) {
  const styles =
    tone === "error"
      ? "border-error/25 bg-error-soft text-error"
      : "border-success/25 bg-success-soft text-success";
  return (
    <div className={`rounded-[var(--radius-sm)] border px-4 py-3 text-sm ${styles}`} role="alert">
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-border-strong bg-surface/60 py-16 px-6 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      {description && <p className="mt-1.5 text-sm text-muted max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin motion-reduce:animate-none ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

export function PageSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-24 text-muted" role="status">
      <Spinner className="h-4 w-4" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}
