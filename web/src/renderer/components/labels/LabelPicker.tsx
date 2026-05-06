import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { useLabels } from '../../hooks/useGraphQL.js';

interface LabelPickerProps {
  workspaceId: string;
  selectedLabelIds: string[];
  onChange: (labelIds: string[]) => void;
}

export function LabelPicker({ workspaceId, selectedLabelIds, onChange }: LabelPickerProps) {
  const { data } = useLabels(workspaceId);
  const labels = data?.labels ?? [];

  if (labels.length === 0) return null;

  const toggleLabel = (labelId: string) => {
    if (selectedLabelIds.includes(labelId)) {
      onChange(selectedLabelIds.filter((id) => id !== labelId));
    } else {
      onChange([...selectedLabelIds, labelId]);
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="px-2 py-0.5 text-xs text-fg-muted hover:text-fg hover:bg-surface-hover border border-edge-subtle rounded transition-colors focus:outline-none focus:ring-1 focus:ring-edge"
        data-testid="label-picker-toggle"
      >
        + Label
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="bg-surface-hover border border-edge rounded-md shadow-dropdown z-dropdown min-w-[200px] max-h-[280px] overflow-y-auto animate-slide-up py-1 focus:outline-none"
        >
          {labels.map((label) => {
            const isSelected = selectedLabelIds.includes(label.id);
            return (
              <DropdownMenu.CheckboxItem
                key={label.id}
                checked={isSelected}
                onSelect={(e) => {
                  e.preventDefault();
                  toggleLabel(label.id);
                }}
                data-testid={`label-option-${label.id}`}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-body-sm text-left cursor-pointer outline-none transition-colors text-fg data-[highlighted]:bg-surface-active"
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: label.color }}
                />
                <span className="text-fg flex-1 truncate">{label.name}</span>
                {isSelected && <Check className={`${iconSize.xs} text-fg-muted`} />}
              </DropdownMenu.CheckboxItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
