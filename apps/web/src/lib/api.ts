/* ---------------- workflows (server-first, LS fallback) ---------------- */
export type Workflow = {
  id: string;
  name: string;
  status: "draft" | "active" | "paused"; // client-friendly
  createdAt: string;
  updatedAt: string;
};

const WF_LS_KEY = "gs_workflows";

function lsRead(): Workflow[] {
  try {
    const raw = localStorage.getItem(WF_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function lsWrite(rows: Workflow[]) {
  try { localStorage.setItem(WF_LS_KEY, JSON.stringify(rows)); } catch {}
}
function lsCreate(input: { name: string }): Workflow {
  const now = new Date().toISOString();
  const row: Workflow = {
    id: `wf_${Date.now()}`,
    name: input.name || "Untitled workflow",
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  const cur = lsRead();
  lsWrite([row, ...cur]);
  return row;
}
function lsUpdate(id: string, patch: Partial<Workflow>): Workflow {
  const cur = lsRead();
  const idx = cur.findIndex((w) => w.id === id);
  if (idx === -1) return lsCreate({ name: patch.name || "Untitled workflow" });
  const updated: Workflow = { ...cur[idx], ...patch, updatedAt: new Date().toISOString() };
  const next = [...cur];
  next[idx] = updated;
  lsWrite(next);
  return updated;
}

/** Server may return [] or { ok, data }. Normalize to Workflow[] */
function unwrapList(res: any): Workflow[] {
  const arr = Array.isArray(res) ? res : res?.data;
  return Array.isArray(arr) ? arr.map(x => ({
    ...x,
    // map server enums to client strings if needed
    status: String(x.status || "DRAFT").toLowerCase() as Workflow["status"],
  })) : [];
}

export async function listWorkflows(): Promise<Workflow[]> {
  try {
    const res = await http<any>("/api/workflows");
    return unwrapList(res);
  } catch {
    return lsRead();
  }
}

export async function createWorkflow(input: { name: string }): Promise<Workflow> {
  try {
    const res = await http<any>("/api/workflows", {
      method: "POST",
      body: JSON.stringify(input),
    });
    const rows = unwrapList([ (res?.data ?? res) ]);
    return rows[0] ?? lsCreate(input);
  } catch {
    return lsCreate(input);
  }
}

export async function updateWorkflow(
  id: string,
  patch: Partial<Workflow>
): Promise<Workflow> {
  try {
    // server expects DRAFT/ACTIVE/PAUSED
    const toServer: any = { ...patch };
    if (patch.status) {
      const map: Record<Workflow["status"], "DRAFT" | "ACTIVE" | "PAUSED"> = {
        draft: "DRAFT",
        active: "ACTIVE",
        paused: "PAUSED",
      };
      toServer.status = map[patch.status];
    }
    const res = await http<any>(`/api/workflows/${id}`, {
      method: "PATCH",
      body: JSON.stringify(toServer),
    });
    const rows = unwrapList([ (res?.data ?? res) ]);
    return rows[0] ?? lsUpdate(id, patch);
  } catch {
    return lsUpdate(id, patch);
  }
}

export type WfStep =
  | { type: "SEND_TEXT"; textBody: string }
  | { type: "WAIT"; waitMs: number };

export async function replaceWorkflowSteps(id: string, steps: WfStep[]) {
  return http(`/api/workflows/${id}/steps`, {
    method: "PUT",
    body: JSON.stringify({ steps }),
  });
}

export async function deleteWorkflow(id: string) {
  return http(`/api/workflows/${id}`, { method: "DELETE" });
}

export async function listWorkflowsFull() {
  // returns { ok, data } with include: { steps: true }
  return http(`/api/workflows?full=1`);
}
