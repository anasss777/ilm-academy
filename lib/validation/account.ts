// lib/validation/account.ts
// Shared by the browser forms and the API routes. The database trigger repeats the
// same rules (see prisma/migrations_raw/profile_trigger.sql).

import { z } from "zod";

export const PHONE_REGEX = /^\+?[0-9][-0-9 ()]{5,19}$/;
export const COUNTRY_REGEX = /^[A-Z]{2}$/;

const fullName = z.string().trim().min(2).max(200);
const email = z.string().trim().toLowerCase().email().max(254);
const phone = z.string().trim().regex(PHONE_REGEX);
const country = z.string().trim().toUpperCase().regex(COUNTRY_REGEX);
const password = z.string().min(8).max(72); // 72 = bcrypt's byte limit

const validTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});

export const registerSchema = z.object({
  fullName,
  email,
  phone,
  country,
  password,
  /** Consent to share data with the third-party certificate organization */
  consent: z.boolean(),
});

/** Only these fields can be changed by the student. `.strict()` rejects anything else. */
export const profileUpdateSchema = z
  .object({
    fullName: fullName.optional(),
    phone: phone.optional(),
    country: country.optional(),
    locale: z.enum(["ar", "en"]).optional(),
    timezone: z.string().trim().min(1).max(64).refine(validTimezone).optional(),
    telegramUsername: z
      .string()
      .trim()
      .regex(/^@?[A-Za-z0-9_]{5,32}$/)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });
