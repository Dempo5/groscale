// apps/server/src/routes/leads.ts
import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, AuthedRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/leads
router.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const leads = await prisma.lead.findMany({
      where: { ownerId: req.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(leads);
  } catch (err) {
    console.error('list leads error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/leads
router.post('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { name, email, phone } = req.body ?? {};
    if (!name || !email) return res.status(400).json({ error: 'name & email required' });

    const lead = await prisma.lead.create({
      data: { name, email, phone, ownerId: req.userId! },
    });
    res.status(201).json(lead);
  } catch (err) {
    console.error('create lead error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
