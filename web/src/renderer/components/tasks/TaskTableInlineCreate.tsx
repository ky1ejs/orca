import { useEffect, useRef, useState } from 'react';
import { useCreateTask } from '../../hooks/useGraphQL.js';
import type { TaskStatus } from '../../graphql/__generated__/generated.js';

interface TaskTableInlineCreateProps {
  projectId: string;
  status: TaskStatus;
  onClose: () => void;
}

export function TaskTableInlineCreate({ projectId, status, onClose }: TaskTableInlineCreateProps) {
  const { createTask } = useCreateTask();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await createTask({
        title: title.trim(),
        projectId,
        status,
      });
      if (result.error) {
        setError(result.error.message);
        setSubmitting(false);
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create task');
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !submitting) {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="px-3 py-2 border-l-2 border-gray-100 bg-gray-800/30 transition-all duration-150">
      <div className="flex flex-col gap-1.5">
        <input
          ref={titleRef}
          type="text"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
          className="w-full px-2 py-1 bg-transparent border-none text-gray-100 text-body-sm placeholder-gray-500 focus:outline-none"
        />
      </div>
      {error && <p className="text-error text-label-sm mt-1 px-2">{error}</p>}
      <p className="text-gray-600 text-label-sm mt-1 px-2">
        Press Enter to create, Escape to cancel
      </p>
    </div>
  );
}
