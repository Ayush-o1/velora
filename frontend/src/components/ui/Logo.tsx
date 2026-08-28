/**
 * The Velora mark: four seats, one taken. Same motif as the seat grid on
 * the landing hero, at logo scale — a mark tied to what the product
 * actually does (you book one of the seats), not a generic icon.
 *
 * The filled seat is always the brand accent, regardless of surrounding
 * text color; the outline seats and border pick up `currentColor` so the
 * mark still reads correctly wherever it's dropped (nav, footer, a card
 * on a white surface).
 */
export function LogoMark({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="28" height="28" rx="8" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <rect x="8" y="8" width="8" height="8" rx="2.5" fill="var(--color-accent)" />
      <rect x="18" y="8" width="8" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
      <rect x="8" y="18" width="8" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
      <rect x="18" y="18" width="8" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
    </svg>
  );
}

/** Mark + wordmark, sized together. Used anywhere the full lockup fits. */
export function Logo({
  size = 26,
  textClassName = "text-[22px]",
  className = "",
}: {
  size?: number;
  textClassName?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className={`font-display italic tracking-tight ${textClassName}`}>Velora</span>
    </span>
  );
}
