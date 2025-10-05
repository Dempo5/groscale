const base = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => http<{ ok: boolean }>("/api/health"),
  leads: () => http<any[]>("/api/leads"),
  threads: () => http<any[]>("/api/threads"),
  thread: (id: string) => http<any>(`/api/threads/${id}`),
  send: (id: string, text: string) =>
    http<{ ok: boolean; message: any }>(`/api/threads/${id}/send`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
};
