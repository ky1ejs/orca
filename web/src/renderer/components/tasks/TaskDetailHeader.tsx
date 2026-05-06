import { useState, useRef, useEffect, memo } from 'react';
import type { UpdateTaskInput } from '../../graphql/__generated__/generated.js';

interface TaskDetailHeaderProps {
  displayId: string;
  title: string;
  taskId: string;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<unknown>;
}

export const TaskDetailHeader = memo(function TaskDetailHeader({
  displayId,
  title,
  taskId,
  updateTask,
}: TaskDetailHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const keyActionRef = useRef(false);

  useEffect(() => {
    setValue(title);
  }, [title]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  const save = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== title) {
      updateTask(taskId, { title: trimmed });
    } else {
      setValue(title);
    }
    setEditing(false);
  };

  const cancel = () => {
    setValue(title);
    setEditing(false);
  };

  return (
    <div>
      <span className="inline-block font-mono text-code text-fg-muted bg-surface-inset border border-edge-subtle rounded-sm px-1.5 py-0.5 mb-3 leading-none">
        {displayId}
      </span>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (!keyActionRef.current) save();
            keyActionRef.current = false;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              keyActionRef.current = true;
              save();
            }
            if (e.key === 'Escape') {
              keyActionRef.current = true;
              cancel();
            }
          }}
          className="block w-full text-heading-xl font-semibold tracking-tight text-fg bg-surface-inset border border-edge-subtle rounded-md px-2 py-1 -mx-2 focus:outline-none focus:border-accent"
        />
      ) : (
        <h1
          role="button"
          tabIndex={0}
          onClick={() => setEditing(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setEditing(true);
            }
          }}
          className="text-heading-xl font-semibold tracking-tight text-fg cursor-text rounded-md px-2 py-1 -mx-2 border border-transparent hover:border-edge-subtle hover:bg-surface-hover/40 transition-colors"
        >
          {title}
        </h1>
      )}
    </div>
  );
});
