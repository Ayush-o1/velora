"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GITHUB_CLIENT_ID, githubRedirectUri } from "@/lib/config";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Card, Alert } from "@/components/ui/Surfaces";
import { Logo } from "@/components/ui/Logo";
import { GitHubMark } from "@/components/ui/icons";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "authenticated") router.replace("/sessions");
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
      <div className="flex justify-center mb-7">
        <Logo size={30} textClassName="text-2xl" />
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
