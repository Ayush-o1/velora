"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function Nav() {
  const { user, status, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight text-brand">
          Velora
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          <Link href="/" className="text-neutral-600 hover:text-neutral-900">
            Browse
          </Link>

          {status === "authenticated" && user && (
            <>
              <Link href="/bookings" className="text-neutral-600 hover:text-neutral-900">
                My Bookings
              </Link>
              {user.role === "creator" && (
                <Link href="/creator/dashboard" className="text-neutral-600 hover:text-neutral-900">
                  Dashboard
                </Link>
              )}
              <Link href="/profile" className="text-neutral-600 hover:text-neutral-900">
                {user.first_name || user.username}
              </Link>
              <button
                onClick={handleLogout}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700 hover:bg-neutral-100"
              >
                Sign out
              </button>
            </>
          )}

          {status === "unauthenticated" && (
            <Link
              href="/login"
              className="rounded-md bg-brand px-3 py-1.5 text-white hover:bg-brand-hover"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
