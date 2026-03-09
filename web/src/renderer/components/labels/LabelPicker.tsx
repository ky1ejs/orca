import { useState, useRef, useEffect } from 'react';
import { useLabels } from '../../hooks/useGraphQL.js';

interface LabelPickerProps {
  workspaceId: string;
  selectedLabelIds: string[];
  onChange: (labelIds: string[]) => void;
}

export function LabelPicker({ workspaceId, selectedLabelIds, onChange }: LabelPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useLabels(workspaceId);
  const labels = data?.labels ?? [];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const toggleLabel = (labelId: string) => {
    if (selectedLabelIds.includes(labelId)) {
      onChange(selectedLabelIds.filter((id) => id !== labelId));
    } else {
      onChange([...selectedLabelIds, labelId]);
    }
  };

  if (labels.length === 0) return null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="px-2 py-0.5 text-xs text-fg-muted hover:text-fg-muted border border-edge-subtle rounded transition-colors"
        data-testid="label-picker-toggle"
      >
        + Label
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-surface-overlay border border-edge-subtle rounded-md shadow-lg z-10 min-w-[180px] max-h-[240px] overflow-y-auto animate-slide-up">
          {labels.map((label) => {
            const isSelected = selectedLabelIds.includes(label.id);
            return (
              <button
                key={label.id}
                onClick={() => toggleLabel(label.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-surface-hover transition-colors"
                data-testid={`label-option-${label.id}`}
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: label.color }}
                />
                <span className="text-fg flex-1 truncate">{label.name}</span>
                {isSelected && <span className="text-accent text-xs">&#10003;</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
