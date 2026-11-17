// lib/maintenance/cron.ts
// Authentication for the scheduled-job endpoint. A scheduler (Vercel Cron, pg_cron, GitHub
// Actions...) calls it with:  Authorization: Bearer <CRON_SECRET>
// Fails closed: with no secret configured, nobody can call it.

import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  // timingSafeEqual needs equal lengths; the length itself is not a secret
  return given.length === expected.length && timingSafeEqual(given, expected);
}
