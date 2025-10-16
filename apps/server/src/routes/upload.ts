// ----- add in apps/server/src/index.ts (or a dedicated router) -----
import { prisma } from "./db.js"; // adjust path if your prisma client is elsewhere
import { requireAuth } from "./middleware/requireAuth.js"; // adjust if named differently

// POST /api/uploads/import
// Body: { rows: Array<{name?, email?, phone?, city?, state?, zip?}> }
app.post("/api/uploads/import", requireAuth, async (req: any, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows) return res.status(400).json({ error: "rows required" });

    const ownerId: string = req.userId; // set by requireAuth
    let created = 0, updated = 0, skipped = 0;

    for (const r of rows) {
      // normalize
      const name  = (r.name  ?? "").toString().trim() || null;
      const email = (r.email ?? "").toString().trim().toLowerCase() || null;
      const rawPhone = (r.phone ?? "").toString();
      const phone = rawPhone ? rawPhone.replace(/[^\d+]/g, "") : null;
      const city  = (r.city  ?? null) as string | null;
      const state = (r.state ?? null) as string | null;
      const zip   = (r.zip   ?? null) as string | null;

      if (!email && !phone) { skipped++; continue; }

      // find existing by (email, owner) OR (phone, owner)
      const existing = await prisma.lead.findFirst({
        where: {
          ownerId,
          OR: [
            email ? { email } : undefined,
            phone ? { phone } : undefined,
          ].filter(Boolean) as any,
        },
      });

      if (!existing) {
        await prisma.lead.create({
          data: { ownerId, name, email, phone, city, state, zip },
        });
        created++;
      } else {
        await prisma.lead.update({
          where: { id: existing.id },
          data: { name, email, phone, city, state, zip },
        });
        updated++;
      }
    }

    res.json({ ok: true, created, updated, skipped });
  } catch (e: any) {
    console.error("upload import error", e);
    res.status(500).json({ error: "Server error" });
  }
});
