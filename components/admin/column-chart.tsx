/** Vertical bars with the value above and a label below. No chart library: plain CSS. */
export function ColumnChart({
  items,
  ariaLabel,
}: {
  items: { label: string; value: number }[];
  ariaLabel: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div role="img" aria-label={ariaLabel} className="stack gap-1" dir="ltr">
      <div className="chart-col">
        {items.map((it, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] text-muted">{it.value}</span>
            <div className="chart-bar" style={{ height: `${(it.value / max) * 82}%` }} title={`${it.label}: ${it.value}`} />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        {items.map((it, i) => (
          <span key={i} className="flex-1 text-center text-[10px] text-muted">
            {it.label}
          </span>
        ))}
      </div>
    </div>
  );
}
