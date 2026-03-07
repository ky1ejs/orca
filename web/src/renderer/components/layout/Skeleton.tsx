interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-800 ${className}`}
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
          <div key={i} className="p-4 bg-gray-900 rounded-lg border border-gray-800">
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
            className="p-3 bg-gray-900 rounded-lg border border-gray-800 flex items-center justify-between"
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
    <div className="p-6" data-testid="task-detail-skeleton">
      <Skeleton className="h-4 w-16 mb-4" />
      <Skeleton className="h-4 w-32 mb-4" />
      <Skeleton className="h-8 w-72 mb-4" />
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <div>
          <Skeleton className="h-4 w-32 mb-2" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-8 w-28" />
        </div>
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
