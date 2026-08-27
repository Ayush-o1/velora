"use client";

import { useRouter } from "next/navigation";
import { sessionsApi } from "@/lib/api";
import type { SessionWritePayload } from "@/lib/types";
import { useRequireAuth } from "@/lib/use-require-auth";
import { SessionForm } from "@/components/SessionForm";
import { PageSpinner } from "@/components/ui/Surfaces";

export default function NewSessionPage() {
  const { status } = useRequireAuth("creator");
  const router = useRouter();

  if (status !== "authenticated") return <PageSpinner label="Loading" />;

  const handleCreate = async (payload: SessionWritePayload) => {
    const created = await sessionsApi.create(payload);
    router.push(`/sessions/${created.id}`);
  };

  return (
    <div className="max-w-lg space-y-6 animate-fade-up">
      <h1 className="font-display text-2xl text-ink">Create a session</h1>
      <SessionForm submitLabel="Create session" onSubmit={handleCreate} />
    </div>
  );
}
