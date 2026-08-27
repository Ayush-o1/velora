import { API_BASE } from "./config";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, detail: string) {
    super(detail);
    this.status = status;
    this.code = code;
  }
}

type Listener = {
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null, user: unknown) => void;
  onAuthFailure: () => void;
};

let listener: Listener | null = null;

export function configureApiClient(l: Listener) {
  listener = l;
}

async function parseErrorBody(res: Response): Promise<{ code: string; detail: string }> {
  try {
    const body = await res.json();
    if (body?.error?.code) {
      const detail = typeof body.error.detail === "string" ? body.error.detail : JSON.stringify(body.error.detail);
      return { code: body.error.code, detail };
    }
  } catch {
    // fall through to generic message below
  }
  return { code: "unknown_error", detail: res.statusText || "Something went wrong." };
}

/**
 * Calls the refresh endpoint directly (cookie-based, no Authorization
 * header needed). Used both for the silent refresh on app load and as
 * the retry path when a request comes back 401.
 *
 * De-duplicated on purpose: the refresh cookie rotates on every use and
 * the old one is blacklisted server-side, so two refresh calls firing
 * close together (React Strict Mode's double-invoked mount effect in
 * dev; in principle also a slow network plus more than one component
 * hitting a 401 at once) race for the same not-yet-rotated cookie —
 * whichever request loses gets a 401 and clears the cookie the winner
 * just set, silently logging the user out. Sharing one in-flight
 * promise means concurrent callers within this tab get the same result
 * instead of firing a second request that can undo the first's.
 */
let inFlightRefresh: Promise<{ access: string; user: unknown } | null> | null = null;

export async function refreshSession(): Promise<{ access: string; user: unknown } | null> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh/`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}, _isRetry = false): Promise<T> {
  const headers = new Headers(options.headers);
  const token = listener?.getAccessToken() ?? null;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body,
    credentials: "include",
  });

  if (res.status === 401 && !_isRetry && listener) {
    const refreshed = await refreshSession();
    if (refreshed) {
      listener.setAccessToken(refreshed.access, refreshed.user);
      return apiFetch<T>(path, options, true);
    }
    listener.onAuthFailure();
  }

  if (!res.ok) {
    const { code, detail } = await parseErrorBody(res);
    throw new ApiError(res.status, code, detail);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}
