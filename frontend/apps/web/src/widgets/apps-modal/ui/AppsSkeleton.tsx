export const AppsSkeleton = () => (
  <div className="grid gap-2">
    {[0, 1, 2].map((i) => (
      <div key={i} className="h-[62px] animate-pulse rounded-card border border-line bg-surface" />
    ))}
  </div>
);
