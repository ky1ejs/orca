import type { ReactNode } from 'react';

interface TaskSectionHeadingProps {
  title: string;
  count?: number;
  action?: ReactNode;
  id?: string;
}

export function TaskSectionHeading({ title, count, action, id }: TaskSectionHeadingProps) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2
        id={id}
        className="flex items-baseline gap-2 text-heading-sm font-semibold text-fg tracking-tight"
      >
        <span>{title}</span>
        {typeof count === 'number' && count > 0 && (
          <span className="font-mono text-code-sm text-fg-muted bg-surface-inset border border-edge-subtle rounded-sm px-1.5 py-0.5 leading-none">
            {count}
          </span>
        )}
      </h2>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
