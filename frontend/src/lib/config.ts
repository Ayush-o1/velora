// Empty string means "same origin" — correct when Nginx proxies /api to the
// backend (Docker Compose setup). Local `next dev` without Nginx sets
// NEXT_PUBLIC_API_URL to the backend's own port instead.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export const GITHUB_CLIENT_ID = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ?? "";

export function githubRedirectUri(): string {
  if (process.env.NEXT_PUBLIC_GITHUB_OAUTH_REDIRECT_URI) {
    return process.env.NEXT_PUBLIC_GITHUB_OAUTH_REDIRECT_URI;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}/auth/callback`;
  }
  return "";
}
