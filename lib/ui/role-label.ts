// lib/ui/role-label.ts
// Built-in roles have translated names; custom roles show the name they were given.

const SYSTEM = ["owner", "instructor", "assistant", "student"];

export const roleLabel = (t: (key: string) => string, key: string, name: string) =>
  SYSTEM.includes(key) ? t(`names.${key}`) : name;
