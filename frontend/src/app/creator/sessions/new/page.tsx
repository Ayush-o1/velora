"use client";

import { useRouter } from "next/navigation";
import { sessionsApi } from "@/lib/api";
import type { SessionWritePayload } from "@/lib/types";
import { useRequireAuth } from "@/lib/use-require-auth";
import { SessionForm } from "@/components/SessionForm";
import { LoadingSpinner } from "@/components/ui";

export default function NewSessionPage() {
  const { status } = useRequireAuth("creator");
  const router = useRouter();

  if (status !== "authenticated") return <LoadingSpinner />;

  const handleCreate = async (payload: SessionWritePayload) => {
    const created = await sessionsApi.create(payload);
    router.push(`/sessions/${created.id}`);
  };

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Create a session</h1>
      <SessionForm submitLabel="Create session" onSubmit={handleCreate} />
    </div>
  );
}
