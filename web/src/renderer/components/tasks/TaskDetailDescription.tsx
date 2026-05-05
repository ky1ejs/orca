import { useState, useRef, useEffect, memo } from 'react';
import { Edit3 } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { MarkdownRenderer } from '../markdown/MarkdownRenderer.js';
import type { UpdateTaskInput } from '../../graphql/__generated__/generated.js';

interface TaskDetailDescriptionProps {
  description: string | null;
  taskId: string;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<unknown>;
}

const KBD_CLASS =
  'inline-flex items-center font-mono text-code-sm bg-surface-inset border border-edge-subtle text-fg-muted px-1 py-px rounded-sm leading-none';

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
      <div className="rounded-lg border border-edge-subtle bg-surface-raised/50 p-1">
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
          className="w-full px-4 py-3 bg-transparent text-fg placeholder-fg-faint text-body focus:outline-none resize-y min-h-[140px]"
          rows={6}
        />
        <div className="flex items-center gap-2 px-3 py-2 border-t border-edge-subtle text-fg-faint text-label-sm">
          <span>Markdown supported.</span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <kbd className={KBD_CLASS}>⌘</kbd>
            <kbd className={KBD_CLASS}>↵</kbd>
            <span>save</span>
            <span className="text-edge mx-1">·</span>
            <kbd className={KBD_CLASS}>esc</kbd>
            <span>cancel</span>
          </span>
        </div>
      </div>
    );
  }

  const isEmpty = !description;

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
      className={`group relative rounded-lg border border-edge-subtle px-5 py-4 cursor-text transition-colors hover:border-edge hover:bg-surface-raised/40 focus:outline-none focus:border-edge ${
        isEmpty ? 'bg-surface-raised/20' : 'bg-surface-raised/40'
      }`}
    >
      {isEmpty ? (
        <div className="flex items-center gap-2 text-fg-faint text-body-sm italic">
          <Edit3 className={`${iconSize.sm} text-fg-faint`} />
          <span>Add a description...</span>
        </div>
      ) : (
        <MarkdownRenderer content={description} />
      )}
    </div>
  );
});
