import { Router } from "express";
import { prisma } from "../../prisma.js"; // ESM extension

const router = Router();

const toDTO = (t: any) => ({
  id: t.id,
  name: t.name,
  color: t.color ?? null,
  workflowId: t.workflowId ?? null,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

// TODO: replace with real auth
const ownerIdFrom = (req: any) => req?.user?.id || "system";

/** GET /api/tags */
router.get("/", async (req, res) => {
  const ownerId = ownerIdFrom(req);
  const rows = await prisma.tag.findMany({
    where: { ownerId },
    orderBy: [{ name: "asc" }],
  });
  res.json({ ok: true, tags: rows.map(toDTO) });
});

/** POST /api/tags */
router.post("/", async (req, res) => {
  const ownerId = ownerIdFrom(req);
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "Name required" });

  const color =
    req.body?.color === "" || req.body?.color == null ? null : String(req.body.color);
  const workflowId =
    req.body?.workflowId === "" || req.body?.workflowId == null
      ? null
      : String(req.body.workflowId);

  try {
    const row = await prisma.tag.create({ data: { ownerId, name, color, workflowId } });
    res.status(201).json({ ok: true, tag: toDTO(row) });
  } catch (e: any) {
    if (String((e as any)?.code) === "P2002") {
      return res.status(409).json({ ok: false, error: "Tag name already exists" });
    }
    res.status(500).json({ ok: false, error: (e as any)?.message || "Create failed" });
  }
});

/** PATCH /api/tags/:id */
router.patch("/:id", async (req, res) => {
  const ownerId = ownerIdFrom(req);
  const id = String(req.params.id);

  const data: any = {};
  if (req.body?.name !== undefined) {
    const nm = String(req.body.name || "").trim();
    if (!nm) return res.status(400).json({ ok: false, error: "Name required" });
    data.name = nm;
  }
  if (req.body?.color !== undefined) {
    data.color = req.body.color === "" || req.body.color == null ? null : String(req.body.color);
  }
  if (req.body?.workflowId !== undefined) {
    data.workflowId =
      req.body.workflowId === "" || req.body.workflowId == null
        ? null
        : String(req.body.workflowId);
  }

  const existing = await prisma.tag.findFirst({ where: { id, ownerId } });
  if (!existing) return res.status(404).json({ ok: false, error: "Not found" });

  try {
    const row = await prisma.tag.update({ where: { id }, data });
    res.json({ ok: true, tag: toDTO(row) });
  } catch (e: any) {
    if (String((e as any)?.code) === "P2002") {
      return res.status(409).json({ ok: false, error: "Tag name already exists" });
    }
    res.status(500).json({ ok: false, error: (e as any)?.message || "Update failed" });
  }
});

/** DELETE /api/tags/:id */
router.delete("/:id", async (req, res) => {
  const ownerId = ownerIdFrom(req);
  const id = String(req.params.id);

  const existing = await prisma.tag.findFirst({ where: { id, ownerId } });
  if (!existing) return res.status(404).json({ ok: false, error: "Not found" });

  await prisma.tag.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
