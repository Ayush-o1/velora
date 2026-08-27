"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GITHUB_CLIENT_ID, githubRedirectUri } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { Button, Card, ErrorBanner } from "@/components/ui";

function randomState(): string {
  return crypto.randomUUID();
}

export default function LoginPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  const handleSignIn = () => {
    const state = randomState();
    sessionStorage.setItem("velora_oauth_state", state);
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: githubRedirectUri(),
      scope: "read:user user:email",
      state,
    });
    window.location.href = `https://github.com/login/oauth/authorize?${params.toString()}`;
  };

  return (
    <div className="max-w-sm mx-auto">
      <Card className="text-center space-y-4">
        <h1 className="text-xl font-semibold text-neutral-900">Sign in to Velora</h1>
        <p className="text-sm text-neutral-500">
          Sign in with GitHub to book sessions or host your own.
        </p>
        {!GITHUB_CLIENT_ID ? (
          <ErrorBanner message="GitHub OAuth isn't configured yet (missing NEXT_PUBLIC_GITHUB_CLIENT_ID)." />
        ) : (
          <Button onClick={handleSignIn} className="w-full justify-center">
            Continue with GitHub
          </Button>
        )}
      </Card>
    </div>
  );
}
