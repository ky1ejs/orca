import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import {
  useWorkspaceBySlug,
  useCreateProject,
  useProjectSubscription,
} from '../../hooks/useGraphQL.js';
import { useNavigation } from '../../navigation/context.js';
import { useWorkspace } from '../../workspace/context.js';
import { ProjectListSkeleton } from '../layout/Skeleton.js';
import { EmptyProjectList } from '../layout/EmptyState.js';

export function ProjectList() {
  const { currentWorkspace } = useWorkspace();
  const { data, fetching, error } = useWorkspaceBySlug(currentWorkspace?.slug ?? '');
  const { createProject } = useCreateProject();
  const { navigate } = useNavigation();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useProjectSubscription(currentWorkspace?.id ?? '');

  const handleCreate = async () => {
    if (!name.trim() || !currentWorkspace) return;
    await createProject({
      name: name.trim(),
      description: description.trim() || undefined,
      workspaceId: currentWorkspace.id,
    });
    setName('');
    setDescription('');
    setShowCreate(false);
  };

  if (fetching && !data) {
    return <ProjectListSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6 text-error">
        <p>Error loading projects: {error.message}</p>
      </div>
    );
  }

  const projects = data?.workspace?.projects ?? [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-heading-lg font-bold text-white">Projects</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded-md transition-colors inline-flex items-center"
        >
          {showCreate ? (
            <>
              <X className={`${iconSize.sm} mr-1`} />
              Cancel
            </>
          ) : (
            <>
              <Plus className={`${iconSize.sm} mr-1`} />
              New Project
            </>
          )}
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 p-4 bg-gray-900 rounded-lg border border-gray-800">
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 text-body-sm focus-ring"
              autoFocus
            />
            <textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 text-body-sm focus-ring resize-none"
              rows={3}
            />
            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:bg-gray-700 disabled:text-gray-500 text-on-accent text-label-md rounded-md transition-colors"
            >
              Create Project
            </button>
          </div>
        </div>
      )}

      {projects.length === 0 && !showCreate ? (
        <EmptyProjectList onCreateProject={() => setShowCreate(true)} />
      ) : projects.length === 0 ? null : (
        <div className="space-y-2">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() =>
                navigate({ view: 'project', id: project.id, projectName: project.name })
              }
              className="w-full text-left p-4 bg-gray-900 hover:bg-gray-800 rounded-lg border border-gray-800 transition-colors"
            >
              <h3 className="text-white font-medium">{project.name}</h3>
              {project.description && (
                <p className="text-gray-400 text-body-sm mt-1 line-clamp-2">
                  {project.description}
                </p>
              )}
              <p className="text-gray-600 text-label-sm mt-2">
                {project.tasks.length} {project.tasks.length === 1 ? 'task' : 'tasks'}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
