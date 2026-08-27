"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRequireAuth } from "@/lib/use-require-auth";
import { ApiError } from "@/lib/api-client";
import type { User } from "@/lib/types";
import { Badge, Button, Card, ErrorBanner, LoadingSpinner } from "@/components/ui";

export default function ProfilePage() {
  const { user, status } = useRequireAuth();

  if (status !== "authenticated" || !user) return <LoadingSpinner />;

  return <ProfileEditor user={user} />;
}

// Split out so form fields can be initialized directly from `user` props
// (a lazy useState initializer) instead of copying into state via an
// effect — the pattern React's docs recommend over "adjusting state
// when a prop changes".
function ProfileEditor({ user }: { user: User }) {
  const { updateProfile } = useAuth();

  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [bio, setBio] = useState(user.bio);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfile({ first_name: firstName, last_name: lastName, bio });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  const becomeCreator = async () => {
    setError(null);
    try {
      await updateProfile({ role: "creator" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update role.");
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900">Your profile</h1>
        <Badge tone={user.role === "creator" ? "green" : "neutral"}>{user.role}</Badge>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          {user.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar_url} alt="" className="h-12 w-12 rounded-full" />
          )}
          <div>
            <p className="font-medium text-neutral-900">{user.username}</p>
            <p className="text-sm text-neutral-500">{user.email}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-neutral-700">
              First name
              <input
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </label>
            <label className="text-sm text-neutral-700">
              Last name
              <input
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm text-neutral-700">
            Bio
            <textarea
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              rows={3}
              maxLength={500}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </label>

          {error && <ErrorBanner message={error} />}
          {saved && <p className="text-sm text-emerald-700">Saved.</p>}

          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </Card>

      {user.role === "user" && (
        <Card className="space-y-2">
          <h2 className="font-medium text-neutral-900">Want to host sessions?</h2>
          <p className="text-sm text-neutral-500">
            Become a creator to create and manage your own sessions.
          </p>
          <Button variant="secondary" onClick={becomeCreator}>
            Become a creator
          </Button>
        </Card>
      )}
    </div>
  );
}
