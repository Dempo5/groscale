import { Router } from "express";
import { PrismaClient, LeadStatus } from "@prisma/client";
import auth from "../middleware/auth";

const r = Router();
const prisma = new PrismaClient();

// Create a lead
r.post("/", auth, async (req, res) => {
  const uid = (req as any).uid as string;
  const { firstName, lastName, phone, email, tags } = req.body || {};
  if (!phone) return res.status(400).json({ error: "phone required" });

  const lead = await prisma.lead.create({
    data: {
      ownerId: uid,
      firstName,
      lastName,
      phone,
      email,
      tags: Array.isArray(tags) ? tags : [],
    },
  });
  res.json(lead);
});

// List my leads
r.get("/", auth, async (req, res) => {
  const uid = (req as any).uid as string;
  const leads = await prisma.lead.findMany({
    where: { ownerId: uid },
    orderBy: { createdAt: "desc" },
  });
  res.json(leads);
});

// Update status
r.patch("/:id/status", auth, async (req, res) => {
  const uid = (req as any).uid as string;
  const { id } = req.params;
  const { status } = req.body || {};
  if (!["NEW","CONTACTED","BOOKED","CLOSED"].includes(status))
    return res.status(400).json({ error: "bad status" });

  const updated = await prisma.lead.updateMany({
    where: { id, ownerId: uid },
    data: { status: status as LeadStatus },
  });
  if (updated.count === 0) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

export default r;
