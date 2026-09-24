// Upload history lives on the server now. These call it directly with the
// login token, the same way api.ts's http() does.
import { BASE, getToken } from "./api";

export type UploadRow = {
  id: string;
  fileName: string;
  leads: number;
  duplicates: number;
  fileDuplicates: number;
  invalids: number;
  status: "PENDING" | "PROCESSING" | "SUCCESS" | "PARTIAL" | "FAILED";
  error: string | null;
  skippedTruncated: boolean;
  createdAt: string;
};

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function listUploads(): Promise<UploadRow[]> {
  const res = await fetch(`${BASE}/api/uploads`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Couldn't load your uploads.");
  return data?.data || [];
}

/** Fetch the skipped rows as a CSV and hand it to the browser as a download. */
export async function downloadSkippedRows(uploadId: string, fileName: string) {
  const res = await fetch(`${BASE}/api/uploads/${uploadId}/skipped`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Couldn't download those rows.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName.replace(/\.csv$/i, "")}-skipped.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
