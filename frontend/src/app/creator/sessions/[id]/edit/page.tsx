"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { sessionsApi } from "@/lib/api";
import type { SessionItem, SessionWritePayload } from "@/lib/types";
import { useRequireAuth } from "@/lib/use-require-auth";
import { ApiError } from "@/lib/api-client";
import { SessionForm } from "@/components/SessionForm";
import { ErrorBanner, LoadingSpinner } from "@/components/ui";

export default function EditSessionPage() {
  const { status } = useRequireAuth("creator");
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<SessionItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    sessionsApi
      .retrieve(params.id)
      .then(setSession)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this session."));
  }, [status, params.id]);

  if (status !== "authenticated") return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} />;
  if (!session) return <LoadingSpinner />;

  const handleUpdate = async (payload: SessionWritePayload) => {
    await sessionsApi.update(session.id, payload);
    router.push(`/sessions/${session.id}`);
  };

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Edit session</h1>
      <SessionForm initial={session} submitLabel="Save changes" onSubmit={handleUpdate} />
    </div>
  );
}
