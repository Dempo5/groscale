// src/db.ts
import "dotenv/config";           // load .env before touching Prisma
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
