import { useState, useRef, useEffect } from 'react';
import type { UpdateTaskInput } from '../../graphql/__generated__/generated.js';

interface TaskDetailHeaderProps {
  displayId: string;
  title: string;
  taskId: string;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<unknown>;
}

export function TaskDetailHeader({ displayId, title, taskId, updateTask }: TaskDetailHeaderProps) {
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
    <div className="mb-6">
      <span className="text-fg-faint text-label-sm font-mono block mb-1">{displayId}</span>
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
          className="w-full text-heading-lg font-bold text-fg bg-surface-inset border border-edge-subtle rounded-md px-2 py-1 -mx-2 focus:outline-none focus:border-accent"
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
          className="text-heading-lg font-bold text-fg cursor-text rounded px-2 py-1 -mx-2 hover:bg-surface-hover transition-colors"
        >
          {title}
        </h1>
      )}
    </div>
  );
}
