"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GITHUB_CLIENT_ID, githubRedirectUri } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Card, Alert } from "@/components/ui/Surfaces";

function GitHubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.49c-2.01.37-2.53-.49-2.7-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  const handleSignIn = () => {
    const state = crypto.randomUUID();
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
    <div className="max-w-sm mx-auto mt-8 animate-fade-up">
      <div className="text-center mb-7">
        <p className="font-display italic text-2xl text-ink">Velora</p>
      </div>
      <Card className="p-7 text-center space-y-5">
        <div>
          <h1 className="font-display text-xl text-ink">Sign in</h1>
          <p className="mt-1.5 text-[14px] text-ink-secondary">
            Use GitHub to book sessions or host your own — no separate password to manage.
          </p>
        </div>
        {!GITHUB_CLIENT_ID ? (
          <Alert>GitHub sign-in isn&apos;t configured yet (missing NEXT_PUBLIC_GITHUB_CLIENT_ID).</Alert>
        ) : (
          <Button onClick={handleSignIn} className="w-full" size="md">
            <GitHubMark />
            Continue with GitHub
          </Button>
        )}
      </Card>
    </div>
  );
}
