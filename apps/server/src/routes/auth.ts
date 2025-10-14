// apps/server/src/routes/auth.ts
import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import { signToken, requireAuth, AuthedRequest } from "../middleware/auth.js";
import { Prisma } from "@prisma/client";

const router = Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email & password required" });
    }

    const hashed = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, name, password: hashed }, // <-- uses `password` field
      select: { id: true, email: true, name: true }, // never return password
    });

    const token = signToken(user.id);
    res.json({ token, user });
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // unique constraint (e.g., email)
      return res.status(409).json({ error: "Email already in use" });
    }
    console.error("register error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email & password required" });
    }

    // fetch password for comparison, then shape the response without it
    const userWithSecret = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, password: true },
    });

    if (!userWithSecret?.password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, userWithSecret.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken(userWithSecret.id);
    const user = { id: userWithSecret.id, email: userWithSecret.email, name: userWithSecret.name };
    res.json({ token, user });
  } catch (e) {
    console.error("login error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

export default router;
