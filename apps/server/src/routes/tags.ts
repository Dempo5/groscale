import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const r = Router();

// normalize helpers
const nStr = (v: any) =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/** GET /api/tags */
r.get("/", async (_req, res) => {
  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
  res.json({ ok: true, tags });
});

/** POST /api/tags { name, color?, workflowId? } */
r.post("/", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "name required" });

  const tag = await prisma.tag.create({
    data: {
      name,
      color: nStr(req.body?.color),
      workflowId: nStr(req.body?.workflowId),
      // NOTE: ownerId would come from auth; set a placeholder for now:
      ownerId: "demo-owner",
    },
  });
  res.status(201).json({ ok: true, tag });
});

/** PATCH /api/tags/:id { name?, color?, workflowId? } */
r.patch("/:id", async (req, res) => {
  const id = String(req.params.id);
  const patch: any = {};
  if (req.body?.name !== undefined) patch.name = String(req.body.name || "");
  if (req.body?.color !== undefined) patch.color = nStr(req.body.color);
  if (req.body?.workflowId !== undefined) patch.workflowId = nStr(req.body.workflowId);

  const tag = await prisma.tag.update({ where: { id }, data: patch });
  res.json({ ok: true, tag });
});

/** DELETE /api/tags/:id */
r.delete("/:id", async (req, res) => {
  const id = String(req.params.id);
  await prisma.$transaction(async (tx) => {
    await tx.leadTag.deleteMany({ where: { tagId: id } });
    await tx.tag.delete({ where: { id } });
  });
  res.json({ ok: true });
});

export default r;
