const API_BASE = import.meta.env.VITE_API_URL || "https://groscale.onrender.com";

export async function getLeads() {
  try {
    const res = await fetch(`${API_BASE}/api/leads`, {
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error("❌ API error:", error);
    throw error;
  }
}
