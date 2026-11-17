/** A horizontal bar split into coloured parts (e.g. present / partial / absent / excused). */
export function SegmentedBar({
  segments,
  label,
}: {
  segments: { className: string; value: number; title: string }[];
  label: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <div className="seg-bar" role="img" aria-label={label}>
      {total > 0
        ? segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <span key={s.title} className={s.className} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.title}: ${s.value}`} />
            ))
        : null}
    </div>
  );
}
