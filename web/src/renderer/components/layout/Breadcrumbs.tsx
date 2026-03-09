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
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      <ol className="flex items-center gap-1 text-sm">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;
          return (
            <li key={index} className="flex items-center gap-1">
              {index > 0 && <span className="text-gray-600">›</span>}
              {segment.onClick && !isLast ? (
                <button
                  onClick={segment.onClick}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  {segment.label}
                </button>
              ) : (
                <span className="text-gray-100">{segment.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
