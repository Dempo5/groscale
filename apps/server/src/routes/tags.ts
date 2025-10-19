// apps/server/src/routes/tags.ts
import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../prisma.js";

const router = Router();

/** Shape returned to client */
function toDTO(t: any) {
  return {
    id: t.id,
    name: t.name,
    color: t.color ?? null,
    workflowId: t.workflowId ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/** Always return a valid owner id (avoid FK errors) */
async function ensureOwnerId(req: any): Promise<string> {
  // 1) logged-in user
  if (req?.user?.id) return String(req.user.id);

  // 2) any existing user
  const any = await prisma.user.findFirst({ select: { id: true } });
  if (any?.id) return any.id;

  // 3) seed a system user
  const hashed = await bcrypt.hash("placeholder", 8);
  const system = await prisma.user.create({
    data: {
      id: "system",
      email: "system@groscale.local",
      name: "System",
      hashedPassword: hashed,
    },
    select: { id: true },
  });
  return system.id;
}

/** GET /api/tags */
router.get("/", async (req, res) => {
  try {
    const ownerId = await ensureOwnerId(req);
    const rows = await prisma.tag.findMany({
      where: { ownerId },
      orderBy: [{ name: "asc" }],
    });
    res.json({ ok: true, tags: rows.map(toDTO) });
  } catch (e: any) {
    console.error("GET /tags failed:", e);
    res.status(500).json({ ok: false, error: e?.message || "Failed to load tags" });
  }
});

/** POST /api/tags  body: { name, color?, workflowId? } */
router.post("/", async (req, res) => {
  try {
    const ownerId = await ensureOwnerId(req);
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "Name required" });

    const color =
      req.body?.color === "" || req.body?.color == null ? null : String(req.body.color);
    const workflowId =
      req.body?.workflowId === "" || req.body?.workflowId == null
        ? null
        : String(req.body.workflowId);

    const row = await prisma.tag.create({
      data: { ownerId, name, color, workflowId },
    });
    res.status(201).json({ ok: true, tag: toDTO(row) });
  } catch (e: any) {
    // unique(ownerId,name)
    if (String(e?.code) === "P2002") {
      return res.status(409).json({ ok: false, error: "Tag name already exists" });
    }
    console.error("POST /tags failed:", e);
    res.status(500).json({ ok: false, error: e?.message || "Create failed" });
  }
});

/** PATCH /api/tags/:id */
router.patch("/:id", async (req, res) => {
  try {
    const ownerId = await ensureOwnerId(req);
    const id = String(req.params.id);

    const data: any = {};
    if (req.body?.name !== undefined) {
      const nm = String(req.body.name || "").trim();
      if (!nm) return res.status(400).json({ ok: false, error: "Name required" });
      data.name = nm;
    }
    if (req.body?.color !== undefined) {
      data.color =
        req.body.color === "" || req.body.color == null ? null : String(req.body.color);
    }
    if (req.body?.workflowId !== undefined) {
      data.workflowId =
        req.body.workflowId === "" || req.body.workflowId == null
          ? null
          : String(req.body.workflowId);
    }

    const existing = await prisma.tag.findFirst({ where: { id, ownerId } });
    if (!existing) return res.status(404).json({ ok: false, error: "Not found" });

    const row = await prisma.tag.update({ where: { id }, data });
    res.json({ ok: true, tag: toDTO(row) });
  } catch (e: any) {
    if (String(e?.code) === "P2002") {
      return res.status(409).json({ ok: false, error: "Tag name already exists" });
    }
    console.error("PATCH /tags failed:", e);
    res.status(500).json({ ok: false, error: e?.message || "Update failed" });
  }
});

/** DELETE /api/tags/:id */
router.delete("/:id", async (req, res) => {
  try {
    const ownerId = await ensureOwnerId(req);
    const id = String(req.params.id);
    const existing = await prisma.tag.findFirst({ where: { id, ownerId } });
    if (!existing) return res.status(404).json({ ok: false, error: "Not found" });

    await prisma.tag.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /tags failed:", e);
    res.status(500).json({ ok: false, error: e?.message || "Delete failed" });
  }
});

export default router;
