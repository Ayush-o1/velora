export type Role = "user" | "creator";

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  avatar_url: string;
  bio: string;
  github_username: string;
  date_joined: string;
}

export interface SessionCreator {
  id: number;
  username: string;
  avatar_url: string;
}

export interface SessionItem {
  id: number;
  creator: SessionCreator;
  title: string;
  description: string;
  location: string;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  seats_taken: number;
  seats_remaining: number;
  has_started: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionWritePayload {
  title: string;
  description: string;
  location: string;
  start_time: string;
  duration_minutes: number;
  capacity: number;
}

export interface BookingSessionSummary {
  id: number;
  title: string;
  location: string;
  start_time: string;
  duration_minutes: number;
  creator_username: string;
}

export interface Booking {
  id: number;
  session: BookingSessionSummary;
  status: "active" | "cancelled";
  created_at: string;
  cancelled_at: string | null;
  is_past: boolean;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
