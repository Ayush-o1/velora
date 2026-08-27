"use client";

import { useRef } from "react";

interface Tab {
  value: string;
  label: string;
}

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: Tab[];
  value: string;
  onChange: (value: string) => void;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const nextIndex = e.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    onChange(next.value);
    refs.current[next.value]?.focus();
  };

  return (
    <div role="tablist" aria-label="Booking status" className="flex gap-1 border-b border-border">
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(el) => {
              refs.current[tab.value] = el;
            }}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`relative px-3.5 py-2.5 text-sm font-medium transition-colors duration-[var(--duration-fast)] ${
              selected ? "text-ink" : "text-muted hover:text-ink-secondary"
            }`}
          >
            {tab.label}
            {selected && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-accent rounded-full" />}
          </button>
        );
      })}
    </div>
  );
}
