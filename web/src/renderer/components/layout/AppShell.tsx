import { Sidebar } from './Sidebar.js';
import { useNavigation } from '../../navigation/context.js';
import { ProjectList } from '../projects/ProjectList.js';
import { ProjectDetail } from '../projects/ProjectDetail.js';
import { TaskDetail } from '../tasks/TaskDetail.js';

function MainContent() {
  const { current } = useNavigation();

  switch (current.view) {
    case 'projects':
      return <ProjectList />;
    case 'project':
      return current.id ? <ProjectDetail projectId={current.id} /> : <ProjectList />;
    case 'task':
      return current.id ? <TaskDetail taskId={current.id} /> : <ProjectList />;
    default:
      return <ProjectList />;
  }
}

export function AppShell() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <MainContent />
      </main>
    </div>
  );
}
