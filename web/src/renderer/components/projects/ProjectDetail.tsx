import { useState } from 'react';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  useProjectSubscription,
  useTaskSubscription,
} from '../../hooks/useGraphQL.js';
import { useNavigation } from '../../navigation/context.js';
import { useWorkspace } from '../../workspace/context.js';
import { TaskTable } from '../tasks/TaskTable.js';
import { ProjectDetailSkeleton } from '../layout/Skeleton.js';

interface ProjectDetailProps {
  projectId: string;
}

export function ProjectDetail({ projectId }: ProjectDetailProps) {
  const { data, fetching, error } = useProject(projectId);
  const { updateProject } = useUpdateProject();
  const { deleteProject } = useDeleteProject();
  const { navigate, navigateBack } = useNavigation();
  const { currentWorkspace } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultDirectory, setDefaultDirectory] = useState('');

  useProjectSubscription(currentWorkspace?.id ?? '');
  useTaskSubscription(currentWorkspace?.id ?? '');

  if (fetching && !data) {
    return <ProjectDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6 text-error">
        <p>Error loading project: {error.message}</p>
      </div>
    );
  }

  const project = data?.project;

  if (!project) {
    return (
      <div className="p-6 text-gray-400">
        <p>Project not found.</p>
      </div>
    );
  }

  const startEditing = () => {
    setName(project.name);
    setDescription(project.description ?? '');
    setDefaultDirectory(project.defaultDirectory ?? '');
    setEditing(true);
  };

  const handleSave = async () => {
    await updateProject(projectId, {
      name: name.trim() || undefined,
      description: description.trim() || undefined,
      defaultDirectory: defaultDirectory.trim() || null,
    });
    setEditing(false);
  };

  const handleDelete = async () => {
    await deleteProject(projectId);
    navigateBack({ view: 'projects' });
  };

  return (
    <div className="p-6">
      <button
        onClick={() => navigateBack({ view: 'projects' })}
        className="text-gray-400 hover:text-white text-label-md mb-4 inline-flex items-center transition-colors"
      >
        <ArrowLeft className={`${iconSize.sm} mr-1`} />
        Back to Projects
      </button>

      {editing ? (
        <div className="mb-6 p-4 bg-gray-900 rounded-lg border border-gray-800">
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white text-body-sm focus-ring"
              autoFocus
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white text-body-sm focus-ring resize-none"
              rows={3}
            />
            <input
              type="text"
              value={defaultDirectory}
              onChange={(e) => setDefaultDirectory(e.target.value)}
              placeholder="Default directory (e.g., /Users/you/projects/my-app)"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 text-body-sm focus-ring font-mono"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded-md transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-label-md rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-heading-lg font-bold text-white">{project.name}</h1>
            <div className="flex gap-2">
              <button
                onClick={startEditing}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-label-md rounded-md transition-colors inline-flex items-center"
              >
                <Pencil className={`${iconSize.sm} mr-1`} />
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 bg-error-muted hover:bg-error-strong text-error text-label-md rounded-md transition-colors inline-flex items-center"
              >
                <Trash2 className={`${iconSize.sm} mr-1`} />
                Delete
              </button>
            </div>
          </div>
          {project.description && <p className="text-gray-400 mt-2">{project.description}</p>}
          {project.defaultDirectory && (
            <p className="text-gray-500 text-body-sm font-mono mt-2">{project.defaultDirectory}</p>
          )}
        </div>
      )}

      <TaskTable
        projectId={projectId}
        tasks={project.tasks}
        onTaskClick={(taskId) => navigate({ view: 'task', id: taskId })}
      />
    </div>
  );
}
