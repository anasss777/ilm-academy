export default function Loading() {
  return (
    <div className="container-page section stack gap-8" aria-busy="true">
      <div className="skeleton h-10 w-64" />
      <div className="skeleton h-11 w-full" />
      <div className="grid-cards">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-72" />
        ))}
      </div>
    </div>
  );
}
