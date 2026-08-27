"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";
import { Card, Alert, PageSpinner } from "@/components/ui/Surfaces";

function CallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { loginWithGitHubCode } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // This effect synchronizes with an external system (the OAuth
    // redirect's query string + the state token stashed in
    // sessionStorage before leaving for GitHub) and runs once on mount
    // — exactly the case effects are for, so the synchronous setState
    // calls below are intentional rather than a "derived state" smell.
    /* eslint-disable react-hooks/set-state-in-effect */
    const oauthError = searchParams.get("error");
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (oauthError) {
      // GitHub itself reports cancellation/denial here (e.g. access_denied).
      setError("Sign-in was cancelled. You can try again whenever you're ready.");
      return;
    }

    if (!code || !state) {
      setError("Missing sign-in details from GitHub. Please try again.");
      return;
    }

    const expectedState = sessionStorage.getItem("velora_oauth_state");
    if (!expectedState || expectedState !== state) {
      setError("This sign-in link looks like it expired or was tampered with. Please try again.");
      return;
    }
    sessionStorage.removeItem("velora_oauth_state");

    loginWithGitHubCode(code)
      .then(() => router.replace("/"))
      .catch((err) => {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Could not complete sign-in. Please try again.");
        }
      });
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="max-w-sm mx-auto mt-8 animate-fade-up">
        <Card className="p-7 text-center space-y-4">
          <Alert>{error}</Alert>
          <Link href="/login" className="inline-block text-[14px] text-accent hover:text-accent-hover underline underline-offset-2">
            Back to sign in
          </Link>
        </Card>
      </div>
    );
  }

  return <PageSpinner label="Signing you in" />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<PageSpinner label="Signing you in" />}>
      <CallbackInner />
    </Suspense>
  );
}
