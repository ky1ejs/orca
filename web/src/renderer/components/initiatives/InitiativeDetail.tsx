import { useState } from 'react';
import { ArrowLeft, Pencil, Archive, Plus, X } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import {
  useInitiative,
  useUpdateInitiative,
  useArchiveInitiative,
  useCreateProject,
} from '../../hooks/useGraphQL.js';
import { useNavigation } from '../../navigation/context.js';
import { useWorkspace } from '../../workspace/context.js';
import { ProjectDetailSkeleton } from '../layout/Skeleton.js';
import { InitiativeActivityFeed } from '../activity/InitiativeActivityFeed.js';

interface InitiativeDetailProps {
  initiativeId: string;
}

export function InitiativeDetail({ initiativeId }: InitiativeDetailProps) {
  const { data, fetching, error } = useInitiative(initiativeId);
  const { updateInitiative } = useUpdateInitiative();
  const { archiveInitiative } = useArchiveInitiative();
  const { createProject } = useCreateProject();
  const { navigate, goToParent } = useNavigation();
  const { currentWorkspace } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');

  if (fetching && !data) {
    return <ProjectDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6 text-error">
        <p>Error loading initiative: {error.message}</p>
      </div>
    );
  }

  const initiative = data?.initiative;

  if (!initiative) {
    if (fetching) {
      return <ProjectDetailSkeleton />;
    }
    return (
      <div className="p-6 text-fg-muted">
        <p>Initiative not found.</p>
      </div>
    );
  }

  const startEditing = () => {
    setName(initiative.name);
    setDescription(initiative.description ?? '');
    setEditing(true);
  };

  const handleSave = async () => {
    await updateInitiative(initiativeId, {
      name: name.trim() || undefined,
      description: description.trim() || undefined,
    });
    setEditing(false);
  };

  const handleArchive = async () => {
    await archiveInitiative(initiativeId);
    goToParent();
  };

  const handleCreateProject = async () => {
    if (!projectName.trim() || !currentWorkspace) return;
    await createProject({
      name: projectName.trim(),
      description: projectDescription.trim() || undefined,
      workspaceId: currentWorkspace.id,
      initiativeId,
    });
    setProjectName('');
    setProjectDescription('');
    setShowCreateProject(false);
  };

  return (
    <div className="p-6">
      <button
        onClick={goToParent}
        className="text-fg-muted hover:text-fg text-label-md mb-4 inline-flex items-center transition-colors"
      >
        <ArrowLeft className={`${iconSize.sm} mr-1`} />
        Back to Initiatives
      </button>

      {editing ? (
        <div className="mb-6 p-4 bg-surface-secondary rounded-lg border border-edge">
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-surface-inset border border-edge rounded-md text-fg text-body-sm focus-ring"
              autoFocus
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-surface-inset border border-edge rounded-md text-fg text-body-sm focus-ring resize-none"
              rows={3}
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
                className="px-3 py-1.5 bg-surface-inset hover:bg-surface-hover text-fg text-label-md rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-heading-lg font-bold text-fg">{initiative.name}</h1>
            <div className="flex gap-2">
              <button
                onClick={startEditing}
                className="px-3 py-1.5 bg-surface-inset hover:bg-surface-hover text-fg text-label-md rounded-md transition-colors inline-flex items-center"
              >
                <Pencil className={`${iconSize.sm} mr-1`} />
                Edit
              </button>
              <button
                onClick={handleArchive}
                className="px-3 py-1.5 bg-error-muted hover:bg-error-strong text-error text-label-md rounded-md transition-colors inline-flex items-center"
              >
                <Archive className={`${iconSize.sm} mr-1`} />
                Archive
              </button>
            </div>
          </div>
          {initiative.description && <p className="text-fg-muted mt-2">{initiative.description}</p>}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-heading-sm font-semibold text-fg-muted">Projects</h2>
        <button
          onClick={() => setShowCreateProject(!showCreateProject)}
          className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded-md transition-colors inline-flex items-center"
        >
          {showCreateProject ? (
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

      {showCreateProject && (
        <div className="mb-4 p-4 bg-surface-secondary rounded-lg border border-edge">
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full px-3 py-2 bg-surface-inset border border-edge rounded-md text-fg placeholder-fg-faint text-body-sm focus-ring"
              autoFocus
            />
            <textarea
              placeholder="Description (optional)"
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              className="w-full px-3 py-2 bg-surface-inset border border-edge rounded-md text-fg placeholder-fg-faint text-body-sm focus-ring resize-none"
              rows={3}
            />
            <button
              onClick={handleCreateProject}
              disabled={!projectName.trim()}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:bg-surface-inset disabled:text-fg-faint text-on-accent text-label-md rounded-md transition-colors"
            >
              Create Project
            </button>
          </div>
        </div>
      )}

      {initiative.projects.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-fg-muted text-body-md">No projects in this initiative yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {initiative.projects.map((project) => (
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
      )}

      <div className="mt-6">
        <InitiativeActivityFeed initiativeId={initiativeId} />
      </div>
    </div>
  );
}
