// lib/notifications/translator.ts
// A tiny {placeholder} translator over the template dictionary. Used for notifications because
// they are rendered in places next-intl is not available (the cron job that sends emails).

export type Translate = (key: string, vars?: Record<string, string>) => string;

export function makeTranslator(dictionary: object): Translate {
  return (key, vars = {}) => {
    const value = key
      .split(".")
      .reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), dictionary);
    if (typeof value !== "string") return key;
    return value.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`);
  };
}
