"use client";

import { useState, type FormEvent } from "react";
import type { SessionItem, SessionWritePayload } from "@/lib/types";
import { Button, ErrorBanner } from "./ui";

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SessionForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: SessionItem;
  submitLabel: string;
  onSubmit: (payload: SessionWritePayload) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [startTime, setStartTime] = useState(initial ? toLocalInputValue(initial.start_time) : "");
  const [durationMinutes, setDurationMinutes] = useState(initial?.duration_minutes ?? 60);
  const [capacity, setCapacity] = useState(initial?.capacity ?? 10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        title,
        description,
        location,
        start_time: new Date(startTime).toISOString(),
        duration_minutes: Number(durationMinutes),
        capacity: Number(capacity),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save session.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block text-sm text-neutral-700">
        Title
        <input
          required
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <label className="block text-sm text-neutral-700">
        Description
        <textarea
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <label className="block text-sm text-neutral-700">
        Location
        <input
          placeholder="Online, or an address"
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </label>

      <div className="grid grid-cols-3 gap-3">
        <label className="block text-sm text-neutral-700 col-span-3 sm:col-span-1">
          Start time
          <input
            required
            type="datetime-local"
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </label>
        <label className="block text-sm text-neutral-700">
          Duration (min)
          <input
            required
            type="number"
            min={1}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm text-neutral-700">
          Capacity
          <input
            required
            type="number"
            min={1}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </label>
      </div>

      {error && <ErrorBanner message={error} />}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
