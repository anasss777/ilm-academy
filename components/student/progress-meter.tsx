/** A horizontal bar. The color tone only sets a CSS variable (see .progress-bar-* in globals.css). */
export function ProgressMeter({
  value,
  tone = "primary",
  label,
}: {
  value: number | null;
  tone?: "primary" | "success" | "warning" | "danger";
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const toneClass = tone === "primary" ? "" : `progress-bar-${tone}`;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className={`progress-bar ${toneClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
