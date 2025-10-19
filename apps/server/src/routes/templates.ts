import { Router } from "express";
import { prisma } from "../../prisma.js"; // ESM extension

const router = Router();
const ownerFrom = (req: any) => (req.user?.id ?? "system");

// list
router.get("/", async (req, res) => {
  const ownerId = ownerFrom(req);
  const q = String(req.query.q || "").trim();
  const data = await prisma.template.findMany({
    where: { ownerId, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
    orderBy: [{ createdAt: "desc" }],
    select: { id: true, name: true, body: true, createdAt: true },
  });
  res.json(data);
});

// create
router.post("/", async (req, res) => {
  const ownerId = ownerFrom(req);
  const { name, body } = req.body || {};
  if (!name?.trim() || !body?.trim()) {
    return res.status(400).json({ ok: false, error: "name & body required" });
  }
  const t = await prisma.template.create({
    data: { ownerId, name: String(name).trim(), body: String(body) },
    select: { id: true, name: true, body: true, createdAt: true },
  });
  res.json(t);
});

// update
router.patch("/:id", async (req, res) => {
  const ownerId = ownerFrom(req);
  const { id } = req.params;
  const { name, body } = req.body || {};
  const exists = await prisma.template.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!exists) return res.status(404).json({ ok: false, error: "not found" });

  const t = await prisma.template.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(body !== undefined ? { body: String(body) } : {}),
    },
    select: { id: true, name: true, body: true, createdAt: true },
  });
  res.json(t);
});

// delete
router.delete("/:id", async (req, res) => {
  const ownerId = ownerFrom(req);
  const { id } = req.params;
  const exists = await prisma.template.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!exists) return res.status(404).json({ ok: false, error: "not found" });
  await prisma.template.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
