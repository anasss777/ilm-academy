// lib/db.ts
// One Prisma client per server process (survives hot reload in dev).
// The app uses the POOLED connection string (DATABASE_URL); migrations and scripts use DIRECT_URL.

import { PrismaPg } from "@prisma/adapter-pg";
// ADJUST this import to your generator `output` path (same as the other files).
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
