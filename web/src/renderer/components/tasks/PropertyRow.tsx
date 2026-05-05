import type { ReactNode } from 'react';

interface PropertyRowProps {
  label: string;
  children: ReactNode;
}

export function PropertyRow({ label, children }: PropertyRowProps) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-3 py-1 -mx-2 px-2 rounded-md transition-colors hover:bg-surface-hover/50">
      <span className="text-fg-faint text-label-sm select-none">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
