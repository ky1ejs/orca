import { useState, useEffect, useRef } from 'react';
import { useCreateTask } from '../../hooks/useGraphQL.js';
import { useWorkspace } from '../../workspace/context.js';
import { useNavigation } from '../../navigation/context.js';

interface ProjectSummary {
  id: string;
  name: string;
  tasks: Array<{ id: string }>;
}

interface QuickCreateTaskProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectSummary[];
}

export function QuickCreateTask({ isOpen, onClose, projects }: QuickCreateTaskProps) {
  const { createTask } = useCreateTask();
  const { currentWorkspace } = useWorkspace();
  const { current, navigate } = useNavigation();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);

  // Initialize state once when the modal opens
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      if (current.view === 'project' && current.id) {
        setProjectId(current.id);
      } else if (current.view === 'task' && current.id) {
        const match = projects.find((p) => p.tasks.some((t) => t.id === current.id));
        setProjectId(match?.id ?? '');
      } else {
        setProjectId('');
      }
      setTitle('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    wasOpen.current = isOpen;
  }, [isOpen, current, projects]);

  if (!isOpen || !currentWorkspace) return null;

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await createTask({
        title: title.trim(),
        workspaceId: currentWorkspace.id,
        projectId: projectId || null,
      });
      if (result.error) {
        setError(result.error.message);
        setSubmitting(false);
        return;
      }
      const taskId = result.data?.createTask?.id;
      onClose();
      setSubmitting(false);
      if (taskId) {
        navigate({ view: 'task', id: taskId });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create task');
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !submitting) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-surface-overlay flex items-start justify-center pt-[20vh] z-modal-backdrop animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-raised border border-edge rounded-lg shadow-modal w-full max-w-lg p-4 animate-scale-in">
        <input
          ref={inputRef}
          type="text"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
          className="w-full px-3 py-2 bg-surface-inset border border-edge-subtle rounded-md text-fg placeholder-fg-faint text-body-sm focus-ring"
          autoFocus
        />
        <div className="mt-3 flex items-center gap-3">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="flex-1 px-3 py-2 bg-surface-inset border border-edge-subtle rounded-md text-fg text-body-sm focus-ring"
          >
            <option value="">No project (Inbox)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || submitting}
            className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:bg-surface-active disabled:text-fg-faint text-on-accent text-label-md rounded-md transition-colors"
          >
            Create
          </button>
        </div>
        {error && <p className="text-error text-label-sm mt-2">{error}</p>}
        <p className="text-fg-faint text-label-sm mt-2">Press Enter to create, Escape to close</p>
      </div>
    </div>
  );
}
