import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { useCreateInitiative } from '../../hooks/useGraphQL.js';
import { useNavigation } from '../../navigation/context.js';
import { useWorkspace } from '../../workspace/context.js';
import { useWorkspaceData } from '../../workspace/workspace-data-context.js';
import { ProjectListSkeleton } from '../layout/Skeleton.js';

export function InitiativeList() {
  const { currentWorkspace } = useWorkspace();
  const { initiatives, projects: allProjects, fetching, error } = useWorkspaceData();
  const { createInitiative } = useCreateInitiative();
  const { navigate } = useNavigation();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = async () => {
    if (!name.trim() || !currentWorkspace) return;
    await createInitiative({
      name: name.trim(),
      description: description.trim() || undefined,
      workspaceId: currentWorkspace.id,
    });
    setName('');
    setDescription('');
    setShowCreate(false);
  };

  if (fetching && initiatives.length === 0 && allProjects.length === 0) {
    return <ProjectListSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6 text-error">
        <p>Error loading workspace: {error.message}</p>
      </div>
    );
  }

  const standaloneProjects = allProjects.filter((p) => !p.initiativeId);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-heading-lg font-bold text-fg">Initiatives & Projects</h1>
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
              New Initiative
            </>
          )}
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 p-4 bg-surface-secondary rounded-lg border border-edge">
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Initiative name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-surface-inset border border-edge rounded-md text-fg placeholder-fg-faint text-body-sm focus-ring"
              autoFocus
            />
            <textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-surface-inset border border-edge rounded-md text-fg placeholder-fg-faint text-body-sm focus-ring resize-none"
              rows={3}
            />
            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:bg-surface-inset disabled:text-fg-faint text-on-accent text-label-md rounded-md transition-colors"
            >
              Create Initiative
            </button>
          </div>
        </div>
      )}

      {/* Initiatives */}
      {initiatives.length > 0 && (
        <div className="mb-8">
          <h2 className="text-heading-sm font-semibold text-fg-muted mb-3">Initiatives</h2>
          <div className="space-y-2">
            {initiatives.map((initiative) => (
              <button
                key={initiative.id}
                onClick={() => navigate({ view: 'initiative', id: initiative.id })}
                className="w-full text-left p-4 bg-surface-secondary hover:bg-surface-hover rounded-lg border border-edge transition-colors"
              >
                <h3 className="text-fg font-medium">{initiative.name}</h3>
                {initiative.description && (
                  <p className="text-fg-muted text-body-sm mt-1 line-clamp-2">
                    {initiative.description}
                  </p>
                )}
                <p className="text-fg-faint text-label-sm mt-2">
                  {initiative.projects.length}{' '}
                  {initiative.projects.length === 1 ? 'project' : 'projects'}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Standalone Projects */}
      {standaloneProjects.length > 0 && (
        <div>
          <h2 className="text-heading-sm font-semibold text-fg-muted mb-3">Projects</h2>
          <div className="space-y-2">
            {standaloneProjects.map((project) => (
              <button
                key={project.id}
                onClick={() =>
                  navigate({ view: 'project', id: project.id, projectName: project.name })
                }
                className="w-full text-left p-4 bg-surface-secondary hover:bg-surface-hover rounded-lg border border-edge transition-colors"
              >
                <h3 className="text-fg font-medium">{project.name}</h3>
                {project.description && (
                  <p className="text-fg-muted text-body-sm mt-1 line-clamp-2">
                    {project.description}
                  </p>
                )}
                <p className="text-fg-faint text-label-sm mt-2">
                  {project.tasks.length} {project.tasks.length === 1 ? 'task' : 'tasks'}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {initiatives.length === 0 && standaloneProjects.length === 0 && !showCreate && (
        <div className="text-center py-12">
          <p className="text-fg-muted text-body-md">No initiatives or projects yet.</p>
          <p className="text-fg-faint text-body-sm mt-1">
            Create an initiative to group related projects together.
          </p>
        </div>
      )}
    </div>
  );
}
