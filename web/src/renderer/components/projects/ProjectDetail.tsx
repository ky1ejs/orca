import { useState } from 'react';
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  useProjectSubscription,
  useTaskSubscription,
} from '../../hooks/useGraphQL.js';
import { useNavigation } from '../../navigation/context.js';
import { TaskList } from '../tasks/TaskList.js';
import { ProjectDetailSkeleton } from '../layout/Skeleton.js';

interface ProjectDetailProps {
  projectId: string;
}

export function ProjectDetail({ projectId }: ProjectDetailProps) {
  const { data, fetching, error, refetch } = useProject(projectId);
  const { updateProject } = useUpdateProject();
  const { deleteProject } = useDeleteProject();
  const { navigate, goBack } = useNavigation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useProjectSubscription(() => {
    refetch({ requestPolicy: 'network-only' });
  });

  useTaskSubscription(() => {
    refetch({ requestPolicy: 'network-only' });
  });

  if (fetching && !data) {
    return <ProjectDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6 text-red-400">
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
    setEditing(true);
  };

  const handleSave = async () => {
    await updateProject(projectId, {
      name: name.trim() || undefined,
      description: description.trim() || undefined,
    });
    setEditing(false);
    refetch({ requestPolicy: 'network-only' });
  };

  const handleDelete = async () => {
    await deleteProject(projectId);
    goBack();
  };

  return (
    <div className="p-6">
      <button
        onClick={goBack}
        className="text-gray-400 hover:text-white text-sm mb-4 inline-flex items-center transition-colors"
      >
        &larr; Back to Projects
      </button>

      {editing ? (
        <div className="mb-6 p-4 bg-gray-900 rounded-lg border border-gray-800">
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white text-sm focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">{project.name}</h1>
            <div className="flex gap-2">
              <button
                onClick={startEditing}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-md transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-300 text-sm rounded-md transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
          {project.description && <p className="text-gray-400 mt-2">{project.description}</p>}
        </div>
      )}

      <TaskList
        projectId={projectId}
        tasks={project.tasks}
        onTaskClick={(taskId) => navigate({ view: 'task', id: taskId })}
      />
    </div>
  );
}
