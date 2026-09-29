const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class RateLimitError extends Error {}
export class DuplicateNameError extends Error {}

export type Checkin = { id: number; name: string; created_at: string; total: number };

export async function getCount(): Promise<number> {
  const res = await fetch(`${API_URL}/checkins/count`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).total;
}

export async function createCheckin(name: string): Promise<Checkin> {
  const res = await fetch(`${API_URL}/checkins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (res.status === 429) throw new RateLimitError("rate limit");
  if (res.status === 409) throw new DuplicateNameError("duplicate name");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
