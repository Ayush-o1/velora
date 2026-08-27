import { apiFetch } from "./api-client";
import type { Booking, Paginated, SessionItem, SessionWritePayload } from "./types";

export const sessionsApi = {
  list: (params?: { upcoming?: boolean }) => {
    const qs = params?.upcoming ? "?upcoming=true" : "";
    return apiFetch<Paginated<SessionItem>>(`/api/sessions/${qs}`);
  },
  retrieve: (id: number | string) => apiFetch<SessionItem>(`/api/sessions/${id}/`),
  mine: () => apiFetch<Paginated<SessionItem>>("/api/sessions/mine/"),
  create: (payload: SessionWritePayload) =>
    apiFetch<SessionItem>("/api/sessions/", { method: "POST", body: payload }),
  update: (id: number | string, payload: Partial<SessionWritePayload>) =>
    apiFetch<SessionItem>(`/api/sessions/${id}/`, { method: "PATCH", body: payload }),
  remove: (id: number | string) => apiFetch<void>(`/api/sessions/${id}/`, { method: "DELETE" }),
};

export const bookingsApi = {
  create: (sessionId: number) =>
    apiFetch<Booking>("/api/bookings/", { method: "POST", body: { session: sessionId } }),
  mine: (scope?: "active" | "past") =>
    apiFetch<Paginated<Booking>>(`/api/bookings/me/${scope ? `?scope=${scope}` : ""}`),
  cancel: (id: number) => apiFetch<Booking>(`/api/bookings/${id}/`, { method: "DELETE" }),
};
