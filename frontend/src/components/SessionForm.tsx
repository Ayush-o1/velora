"use client";

import { useState, type FormEvent } from "react";
import type { SessionItem, SessionWritePayload } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Surfaces";
import { FieldWrapper, Input, Textarea } from "@/components/ui/Field";

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
    <form onSubmit={handleSubmit} className="space-y-5">
      <FieldWrapper label="Title" htmlFor="title">
        <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      </FieldWrapper>

      <FieldWrapper label="Description" htmlFor="description">
        <Textarea id="description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </FieldWrapper>

      <FieldWrapper label="Location" htmlFor="location" hint="Online, or a physical address">
        <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
      </FieldWrapper>

      {/* Start time gets its own full-width row: squeezed into a third of
          a 512px form, the native datetime-local control clipped its own
          value ("31/08/2026, 0(") in every browser tested. */}
      <FieldWrapper label="Start time" htmlFor="start_time">
        <Input
          id="start_time"
          required
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
      </FieldWrapper>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldWrapper label="Duration (min)" htmlFor="duration">
          <Input
            id="duration"
            required
            type="number"
            min={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
          />
        </FieldWrapper>
        <FieldWrapper label="Capacity" htmlFor="capacity">
          <Input
            id="capacity"
            required
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </FieldWrapper>
      </div>

      {error && <Alert>{error}</Alert>}

      <Button type="submit" loading={submitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
