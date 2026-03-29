interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-surface-overlay ${className}`}
      data-testid="skeleton"
      role="status"
      aria-label="Loading"
    />
  );
}

export function ProjectListSkeleton() {
  return (
    <div className="p-6" data-testid="project-list-skeleton">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 bg-surface-raised rounded-lg border border-edge">
            <Skeleton className="h-5 w-48 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectDetailSkeleton() {
  return (
    <div className="p-6" data-testid="project-detail-skeleton">
      <Skeleton className="h-4 w-24 mb-4" />
      <div className="mb-6">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-8 w-24" />
        </div>
        {[1, 2].map((i) => (
          <div
            key={i}
            className="p-3 bg-surface-raised rounded-lg border border-edge flex items-center justify-between"
          >
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TaskDetailSkeleton() {
  return (
    <div className="p-6 grid grid-cols-[1fr_320px] gap-8" data-testid="task-detail-skeleton">
      <div className="space-y-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="space-y-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i}>
            <Skeleton className="h-3 w-16 mb-1.5" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="p-2" data-testid="sidebar-skeleton">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-2">
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}
