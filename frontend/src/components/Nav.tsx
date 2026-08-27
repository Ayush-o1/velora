"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Surfaces";

function NavLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`text-sm transition-colors duration-[var(--duration-fast)] ${
        active ? "text-ink font-medium" : "text-ink-secondary hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export function Nav() {
  const { user, status, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <header className="border-b border-border bg-bg/85 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-[1180px] mx-auto px-5 sm:px-8 h-[68px] flex items-center justify-between">
        <Link href="/" className="font-display italic text-[22px] tracking-tight text-ink">
          Velora
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-7">
          <NavLink href="/sessions">Browse</NavLink>
          {status === "authenticated" && user && (
            <>
              <NavLink href="/bookings">My bookings</NavLink>
              {user.role === "creator" && <NavLink href="/creator/dashboard">Dashboard</NavLink>}
            </>
          )}
        </nav>

        <div className="hidden sm:flex items-center gap-4">
          {status === "authenticated" && user && (
            <>
              <Link
                href="/profile"
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors duration-[var(--duration-fast)] hover:bg-surface-2"
              >
                <Avatar name={user.first_name || user.username} src={user.avatar_url} size={28} />
                <span className="text-sm text-ink-secondary">{user.first_name || user.username}</span>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Sign out
              </Button>
            </>
          )}
          {status === "unauthenticated" && (
            <Link href="/login">
              <Button size="sm">Sign in</Button>
            </Link>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="sm:hidden flex h-9 w-9 items-center justify-center rounded-md text-ink-secondary hover:bg-surface-2"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile panel */}
      {menuOpen && (
        <nav id="mobile-nav" className="sm:hidden border-t border-border bg-bg px-5 py-4 space-y-4">
          <div className="flex flex-col gap-3.5">
            <NavLink href="/sessions" onClick={closeMenu}>Browse</NavLink>
            {status === "authenticated" && user && (
              <>
                <NavLink href="/bookings" onClick={closeMenu}>My bookings</NavLink>
                {user.role === "creator" && (
                  <NavLink href="/creator/dashboard" onClick={closeMenu}>Dashboard</NavLink>
                )}
                <NavLink href="/profile" onClick={closeMenu}>Profile</NavLink>
              </>
            )}
          </div>
          <div className="pt-3 border-t border-border">
            {status === "authenticated" && user ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  closeMenu();
                  handleLogout();
                }}
                className="w-full"
              >
                Sign out
              </Button>
            ) : (
              <Link href="/login" className="block" onClick={closeMenu}>
                <Button size="sm" className="w-full">
                  Sign in
                </Button>
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
