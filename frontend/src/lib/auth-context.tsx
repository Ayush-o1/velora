"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, apiFetch, configureApiClient, refreshSession } from "./api-client";
import { API_BASE } from "./config";
import type { User } from "./types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  loginWithGitHubCode: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, "first_name" | "last_name" | "bio" | "role">>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const accessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    configureApiClient({
      getAccessToken: () => accessTokenRef.current,
      setAccessToken: (token, nextUser) => {
        accessTokenRef.current = token;
        if (nextUser) setUser(nextUser as User);
      },
      onAuthFailure: () => {
        accessTokenRef.current = null;
        setUser(null);
        setStatus("unauthenticated");
      },
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const refreshed = await refreshSession();
      if (cancelled) return;
      if (refreshed) {
        accessTokenRef.current = refreshed.access;
        setUser(refreshed.user as User);
        setStatus("authenticated");
      } else {
        setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loginWithGitHubCode = async (code: string) => {
    const res = await fetch(`${API_BASE}/api/auth/github/callback/`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(res.status, body?.error?.code ?? "oauth_failed", body?.error?.detail ?? "GitHub sign-in failed.");
    }
    const data = await res.json();
    accessTokenRef.current = data.access;
    setUser(data.user as User);
    setStatus("authenticated");
  };

  const logout = async () => {
    try {
      await apiFetch("/api/auth/logout/", { method: "POST" });
    } finally {
      accessTokenRef.current = null;
      setUser(null);
      setStatus("unauthenticated");
    }
  };

  const updateProfile: AuthContextValue["updateProfile"] = async (patch) => {
    const updated = await apiFetch<User>("/api/auth/me/", { method: "PATCH", body: patch });
    setUser(updated);
  };

  return (
    <AuthContext.Provider value={{ user, status, loginWithGitHubCode, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
