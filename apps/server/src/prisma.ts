// Singleton Prisma client used across routes (safe for ESM + hot reload)
import { PrismaClient } from "@prisma/client";

// @ts-ignore - attach to global to avoid multiple clients in dev
const g = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma =
  g.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? [] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") g.__prisma = prisma;