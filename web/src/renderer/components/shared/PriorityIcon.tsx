import { TaskPriority } from '../../graphql/__generated__/generated.js';

interface PriorityIconProps {
  priority: TaskPriority;
  className?: string;
}

const priorityConfig: Record<
  TaskPriority,
  { bars: number; colorClass: string; label: string } | null
> = {
  [TaskPriority.None]: null,
  [TaskPriority.Low]: { bars: 1, colorClass: 'text-blue-400', label: 'Priority: Low' },
  [TaskPriority.Medium]: { bars: 2, colorClass: 'text-yellow-500', label: 'Priority: Medium' },
  [TaskPriority.High]: { bars: 3, colorClass: 'text-orange-400', label: 'Priority: High' },
  [TaskPriority.Urgent]: { bars: 4, colorClass: 'text-orange-500', label: 'Priority: Urgent' },
};

export function PriorityIcon({ priority, className = 'w-4 h-4' }: PriorityIconProps) {
  const config = priorityConfig[priority];

  if (!config) {
    return <span className={className} aria-label="No priority" />;
  }

  const { bars, colorClass, label } = config;
  const barWidth = 2;
  const gap = 1.5;
  const totalBars = 4;

  return (
    <svg className={`${className} ${colorClass}`} viewBox="0 0 16 16" aria-label={label}>
      {Array.from({ length: totalBars }, (_, i) => {
        const x = 2 + i * (barWidth + gap);
        const barHeight = 3 + i * 2.5;
        const y = 13 - barHeight;
        const isActive = i < bars;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={0.5}
            fill={isActive ? 'currentColor' : 'currentColor'}
            opacity={isActive ? 1 : 0.2}
          />
        );
      })}
    </svg>
  );
}
