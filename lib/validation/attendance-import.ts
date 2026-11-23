// lib/validation/attendance-import.ts
import { z } from "zod";
import { validThresholds } from "../staff/attendance-import";

export const importAttendanceSchema = z
  .object({
    /** The whole file as text (read in the browser). 1 MB is plenty for a class list. */
    csv: z.string().min(1).max(1_000_000),
    dryRun: z.boolean(),
    presentPercent: z.number().min(1).max(100).default(75),
    partialPercent: z.number().min(1).max(100).default(25),
    absentMissing: z.boolean().default(false),
    overwriteManual: z.boolean().default(false),
  })
  .strict()
  .refine((v) => validThresholds(v.presentPercent, v.partialPercent), { message: "partialPercent must be below presentPercent" });
