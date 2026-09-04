export default function Loading() {
  return (
    <div className="page-enter space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 rounded bg-white/5 animate-pulse" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl border border-white/5 bg-white/[0.03] animate-pulse" />
        ))}
      </div>
    </div>
  );
}
