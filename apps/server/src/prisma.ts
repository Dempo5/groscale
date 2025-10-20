// Singleton Prisma client used across routes
import { PrismaClient } from "@prisma/client";
export const prisma = new PrismaClient();