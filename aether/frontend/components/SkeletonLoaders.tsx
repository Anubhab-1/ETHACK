/**
 * AETHER — Skeleton Loading Components
 * Replaces bare spinners with structured skeleton UIs.
 */

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonCard({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`glass-card p-4 space-y-3 ${className}`}>
      <Skeleton className="h-4 w-3/5" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i % 2 === 0 ? "w-full" : "w-4/5"}`} />
      ))}
    </div>
  );
}

export function SkeletonStatCard({ className = "" }: SkeletonProps) {
  return (
    <div className={`glass-card p-4 ${className}`}>
      <Skeleton className="h-3 w-2/5 mb-2" />
      <Skeleton className="h-8 w-3/5 mb-1" />
      <Skeleton className="h-2 w-4/5" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4, className = "" }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={`glass-card overflow-hidden ${className}`}>
      {/* Header */}
      <div className={`grid gap-4 px-4 py-3 border-b border-white/5`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-4/5" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className={`grid gap-4 px-4 py-3 border-b border-white/4 ${r % 2 === 0 ? "bg-white/1" : ""}`}
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-3 ${c === 0 ? "w-full" : "w-3/4"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ height = 200, className = "" }: { height?: number; className?: string }) {
  return (
    <div className={`glass-card p-4 ${className}`}>
      <Skeleton className="h-3 w-2/5 mb-4" />
      <div className="flex items-end gap-2" style={{ height }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 skeleton rounded-t"
            style={{ height: `${20 + Math.random() * 70}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Full-page loading overlay */
export function PageSkeleton() {
  return (
    <div className="p-6 space-y-5 animate-fade-in">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
      </div>
      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <SkeletonChart height={220} />
          <SkeletonTable rows={5} cols={4} />
        </div>
        <div className="space-y-4">
          <SkeletonCard rows={4} />
          <SkeletonCard rows={3} />
        </div>
      </div>
    </div>
  );
}
