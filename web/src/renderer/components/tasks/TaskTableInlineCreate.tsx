import { useEffect, useRef, useState } from 'react';
import { useCreateTask } from '../../hooks/useGraphQL.js';
import type { TaskStatus } from '../../graphql/__generated__/generated.js';

interface TaskTableInlineCreateProps {
  projectId: string;
  status: TaskStatus;
  defaultWorkingDirectory: string;
  onClose: () => void;
}

export function TaskTableInlineCreate({
  projectId,
  status,
  defaultWorkingDirectory,
  onClose,
}: TaskTableInlineCreateProps) {
  const { createTask } = useCreateTask();
  const [title, setTitle] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState(defaultWorkingDirectory);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!title.trim() || !workingDirectory.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await createTask({
        title: title.trim(),
        projectId,
        status,
        workingDirectory: workingDirectory.trim(),
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
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="px-3 py-2 border-l-2 border-blue-500 bg-gray-800/30 transition-all duration-150">
      <div className="flex flex-col gap-1.5">
        <input
          ref={titleRef}
          type="text"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
          className="w-full px-2 py-1 bg-transparent border-none text-gray-100 text-sm placeholder-gray-500 focus:outline-none"
        />
        <input
          type="text"
          placeholder="Working directory (e.g., /path/to/project)"
          value={workingDirectory}
          onChange={(e) => setWorkingDirectory(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
          className="w-full px-2 py-1 bg-transparent border-none text-gray-400 text-xs placeholder-gray-600 focus:outline-none"
        />
      </div>
      {error && <p className="text-red-400 text-xs mt-1 px-2">{error}</p>}
      <p className="text-gray-600 text-xs mt-1 px-2">Press Enter to create, Escape to cancel</p>
    </div>
  );
}
