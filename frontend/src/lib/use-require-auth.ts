"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-context";
import type { Role } from "./types";

/**
 * Client-side route gating for UX only (redirect to a sensible place,
 * hide a button). The backend independently enforces every one of these
 * checks with real permission classes, so this hook is not a security
 * boundary — a crafted API request bypasses it entirely, by design.
 */
export function useRequireAuth(requiredRole?: Role) {
  const { user, status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "authenticated" && requiredRole && user?.role !== requiredRole) {
      router.replace("/");
    }
  }, [status, user, requiredRole, router]);

  return { user, status };
}
