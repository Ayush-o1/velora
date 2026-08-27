"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRequireAuth } from "@/lib/use-require-auth";
import { ApiError } from "@/lib/api-client";
import type { User } from "@/lib/types";
import { Badge, Card, Alert, Avatar, PageSpinner } from "@/components/ui/Surfaces";
import { Button } from "@/components/ui/Button";
import { FieldWrapper, Input, Textarea } from "@/components/ui/Field";

export default function ProfilePage() {
  const { user, status } = useRequireAuth();

  if (status !== "authenticated" || !user) return <PageSpinner label="Loading profile" />;

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
    <div className="max-w-lg space-y-6 animate-fade-up">
      <div className="flex items-center gap-4">
        <Avatar name={user.first_name || user.username} src={user.avatar_url} size={52} />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl text-ink">{user.username}</h1>
            <Badge tone={user.role === "creator" ? "success" : "neutral"}>{user.role}</Badge>
          </div>
          <p className="text-[14px] text-muted">{user.email}</p>
        </div>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper label="First name" htmlFor="first_name">
              <Input id="first_name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </FieldWrapper>
            <FieldWrapper label="Last name" htmlFor="last_name">
              <Input id="last_name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </FieldWrapper>
          </div>
          <FieldWrapper label="Bio" htmlFor="bio" hint={`${bio.length}/500`}>
            <Textarea id="bio" rows={3} maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} />
          </FieldWrapper>

          {error && <Alert>{error}</Alert>}
          {saved && <Alert tone="success">Saved.</Alert>}

          <Button type="submit" loading={saving}>
            Save changes
          </Button>
        </form>
      </Card>

      {user.role === "user" && (
        <Card className="p-6 space-y-2.5">
          <h2 className="font-display text-lg text-ink">Want to host sessions?</h2>
          <p className="text-[14px] text-ink-secondary">
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
