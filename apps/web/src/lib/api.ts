const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "https://groscale.onrender.com";

// ping /health to wake the dyno; don’t hit /api/leads (it will be authed soon)
async function waitForApi(maxTries = 6, delayMs = 800) {
  for (let i = 1; i <= maxTries; i++) {
    try {
      const r = await fetch(`${API_BASE}/health`, { credentials: "include" });
      if (r.ok) return;
    } catch (_) {
      /* ignore */
    }
    await new Promise(res => setTimeout(res, delayMs));
  }
  throw new Error("API is still starting. Please try again in a moment.");
}

export async function getLeads() {
  // make sure API is awake (uses /health so it’s always public)
  await waitForApi();

  const res = await fetch(`${API_BASE}/api/leads`, {
    credentials: "include",
  });

  if (!res.ok) {
    // helpful messages
    if (res.status === 401 || res.status === 403) {
      throw new Error("Unauthorized. Login coming soon.");
    }
    throw new Error(`Failed to fetch leads (HTTP ${res.status})`);
  }
  return res.json();
}
