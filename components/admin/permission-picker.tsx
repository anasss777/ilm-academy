"use client";

import { useTranslations } from "next-intl";
import { PERMISSION_GROUPS, permissionMessageKey } from "@/lib/staff/permission-groups";

/**
 * The permission checkboxes, grouped. Used when editing a role and when creating one.
 * A permission the signed-in person does not hold themselves cannot be ADDED (the server
 * enforces the same rule); removing one they do not hold is always allowed.
 */
export function PermissionPicker({
  selected,
  onChange,
  actorPerms,
  locked,
  idPrefix,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  actorPerms: Set<string>;
  locked: boolean;
  idPrefix: string;
}) {
  const t = useTranslations("admin.roles");
  const tp = useTranslations("admin.permissions");

  const toggle = (key: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(key);
    else next.delete(key);
    onChange(next);
  };

  const allKeys = PERMISSION_GROUPS.flatMap((g) => g.keys);

  return (
    <div className="stack gap-4">
      {!locked ? (
        <div className="cluster gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(new Set([...selected, ...allKeys.filter((k) => actorPerms.has(k))]))}>
            {t("selectAll")}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(new Set())}>
            {t("clearAll")}
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PERMISSION_GROUPS.map((g) => (
          <fieldset key={g.id} className="stack gap-2">
            <legend className="mb-1 text-sm font-semibold text-ink">{tp(`groups.${g.id}`)}</legend>
            {g.keys.map((k) => {
              const checked = selected.has(k);
              const cannotAdd = !checked && !actorPerms.has(k);
              return (
                <label key={k} className="flex items-start gap-2 text-sm" title={cannotAdd && !locked ? t("cannotGrant") : undefined}>
                  <input
                    type="checkbox"
                    id={`${idPrefix}-${k}`}
                    className="checkbox mt-0.5"
                    checked={checked}
                    disabled={locked || cannotAdd}
                    onChange={(e) => toggle(k, e.target.checked)}
                  />
                  <span className={cannotAdd ? "text-muted" : undefined}>{tp(`keys.${permissionMessageKey(k)}`)}</span>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
    </div>
  );
}
