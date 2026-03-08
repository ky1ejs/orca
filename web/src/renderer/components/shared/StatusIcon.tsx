import { TaskStatus } from '../../graphql/__generated__/generated.js';

interface StatusIconProps {
  status: TaskStatus;
  className?: string;
}

export function StatusIcon({ status, className = 'w-4 h-4' }: StatusIconProps) {
  switch (status) {
    case TaskStatus.Todo:
      return (
        <svg
          className={`${className} text-gray-400`}
          viewBox="0 0 16 16"
          fill="none"
          aria-label="Status: Todo"
        >
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case TaskStatus.InProgress:
      return (
        <svg
          className={`${className} text-yellow-500`}
          viewBox="0 0 16 16"
          fill="none"
          aria-label="Status: In Progress"
        >
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 1.5A6.5 6.5 0 0 1 14.5 8H8V1.5Z" fill="currentColor" />
        </svg>
      );
    case TaskStatus.InReview:
      return (
        <svg
          className={`${className} text-yellow-500`}
          viewBox="0 0 16 16"
          fill="none"
          aria-label="Status: In Review"
        >
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="4" fill="currentColor" />
        </svg>
      );
    case TaskStatus.Done:
      return (
        <svg
          className={`${className} text-green-500`}
          viewBox="0 0 16 16"
          fill="none"
          aria-label="Status: Done"
        >
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M5 8l2 2 4-4"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}
