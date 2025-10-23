// prisma.ts
import { PrismaClient } from "@prisma/client";

const _prisma = new PrismaClient();

/** Use a global in dev to avoid creating multiple clients on hot-reload */
export const prisma: PrismaClient =
  (globalThis as any).prisma ?? _prisma;

if (process.env.NODE_ENV !== "production") {
  (globalThis as any).prisma = prisma;
}
