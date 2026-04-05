import { useState, useRef, useEffect, memo } from 'react';
import { MarkdownRenderer } from '../markdown/MarkdownRenderer.js';
import type { UpdateTaskInput } from '../../graphql/__generated__/generated.js';

interface TaskDetailDescriptionProps {
  description: string | null;
  taskId: string;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<unknown>;
}

export const TaskDetailDescription = memo(function TaskDetailDescription({
  description,
  taskId,
  updateTask,
}: TaskDetailDescriptionProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(description ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const keyActionRef = useRef(false);

  useEffect(() => {
    setValue(description ?? '');
  }, [description]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }
  }, [editing]);

  const save = () => {
    const trimmed = value.trim();
    if (trimmed !== (description ?? '').trim()) {
      updateTask(taskId, { description: trimmed === '' ? null : trimmed });
    }
    setEditing(false);
  };

  const cancel = () => {
    setValue(description ?? '');
    setEditing(false);
  };

  if (editing) {
    return (
      <div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (!keyActionRef.current) save();
            keyActionRef.current = false;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              keyActionRef.current = true;
              save();
            }
            if (e.key === 'Escape') {
              keyActionRef.current = true;
              cancel();
            }
          }}
          placeholder="Add a description (Markdown supported)"
          className="w-full px-3 py-2 bg-surface-inset border border-edge-subtle rounded-md text-fg placeholder-fg-faint text-body-sm focus:outline-none focus:border-accent resize-y min-h-[120px]"
          rows={6}
        />
        <p className="text-fg-faint text-label-sm mt-1">
          Markdown supported. Cmd+Enter to save, Escape to cancel.
        </p>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className="rounded-md px-3 py-2 -mx-3 cursor-text hover:bg-surface-hover transition-colors border border-transparent hover:border-edge-subtle"
    >
      {description ? (
        <MarkdownRenderer content={description} />
      ) : (
        <p className="text-fg-faint text-body-sm italic">Add a description...</p>
      )}
    </div>
  );
});
