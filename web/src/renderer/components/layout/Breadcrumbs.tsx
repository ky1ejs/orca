import { useNavigation } from '../../navigation/context.js';

interface BreadcrumbSegment {
  label: string;
  onClick?: () => void;
}

export function Breadcrumbs() {
  const { current, navigate, goToParent, canGoToParent } = useNavigation();

  const segments: BreadcrumbSegment[] = [];

  switch (current.view) {
    case 'projects':
      segments.push({ label: 'Projects' });
      break;

    case 'project':
      segments.push({
        label: 'Projects',
        onClick: () => navigate({ view: 'projects' }),
      });
      segments.push({ label: current.projectName ?? 'Project' });
      break;

    case 'task':
      segments.push({
        label: 'Projects',
        onClick: () => navigate({ view: 'projects' }),
      });
      if (current.projectId) {
        segments.push({
          label: current.projectName ?? 'Project',
          onClick: () =>
            navigate({ view: 'project', id: current.projectId, projectName: current.projectName }),
        });
      }
      segments.push({ label: current.taskName ?? 'Task' });
      break;

    case 'settings':
    case 'members':
    case 'invitations':
      segments.push({ label: 'Settings' });
      break;
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 px-6 py-3">
      {canGoToParent && (
        <button
          onClick={goToParent}
          aria-label="Go to parent"
          className="text-gray-400 hover:text-white transition-colors py-0.5"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      )}
      <ol className="flex items-center gap-1 text-xs">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <li key={index} className="flex items-center gap-1">
              {index > 0 && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-3 h-3 text-gray-700"
                  aria-hidden="true"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              )}
              {segment.onClick && !isLast ? (
                <button
                  onClick={segment.onClick}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer py-0.5 px-1 -mx-1 rounded"
                >
                  {segment.label}
                </button>
              ) : (
                <span className="text-gray-100" aria-current="page">
                  {segment.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
