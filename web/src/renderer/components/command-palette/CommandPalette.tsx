import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Folder, Target, Plus, Settings, Users, User, Keyboard } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { useNavigation } from '../../navigation/context.js';
import {
  useCommandPalette,
  type PaletteItem,
  type ActionId,
} from '../../hooks/useCommandPalette.js';
import { StatusIcon } from '../shared/StatusIcon.js';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onShowQuickCreate: () => void;
  onShowShortcutHelp: () => void;
}

interface CategorySection {
  label: string;
  items: PaletteItem[];
}

export function CommandPalette({
  isOpen,
  onClose,
  onShowQuickCreate,
  onShowShortcutHelp,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const { navigate } = useNavigation();
  const results = useCommandPalette(query, isOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Memoize sections and flat item list to stabilize handleKeyDown
  const { sections, flatItems, flatIndexMap } = useMemo(() => {
    const s: CategorySection[] = [];
    if (results.actions.length > 0) s.push({ label: 'Actions', items: results.actions });
    if (results.tasks.length > 0) s.push({ label: 'Tasks', items: results.tasks });
    if (results.projects.length > 0) s.push({ label: 'Projects', items: results.projects });
    if (results.initiatives.length > 0)
      s.push({ label: 'Initiatives', items: results.initiatives });
    const flat = s.flatMap((sec) => sec.items);
    const indexMap = new Map(flat.map((item, i) => [item.id, i]));
    return { sections: s, flatItems: flat, flatIndexMap: indexMap };
  }, [results]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const executeItem = useCallback(
    (item: PaletteItem) => {
      onClose();
      switch (item.type) {
        case 'task':
          navigate({
            view: 'task',
            id: item.id,
            projectId: item.projectId,
            projectName: item.projectName,
            taskName: item.label,
          });
          break;
        case 'project':
          navigate({ view: 'project', id: item.id, projectName: item.label });
          break;
        case 'initiative':
          navigate({ view: 'initiative', id: item.id });
          break;
        case 'action':
          switch (item.actionId) {
            case 'create-task':
              onShowQuickCreate();
              break;
            case 'create-project':
              navigate({ view: 'projects' });
              break;
            case 'my-tasks':
              navigate({ view: 'my-tasks' });
              break;
            case 'settings':
              navigate({ view: 'settings' });
              break;
            case 'members':
              navigate({ view: 'members' });
              break;
            case 'keyboard-shortcuts':
              onShowShortcutHelp();
              break;
          }
          break;
      }
    },
    [navigate, onClose, onShowQuickCreate, onShowShortcutHelp],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % Math.max(flatItems.length, 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(
            (prev) => (prev - 1 + Math.max(flatItems.length, 1)) % Math.max(flatItems.length, 1),
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (flatItems[selectedIndex]) {
            executeItem(flatItems[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatItems, selectedIndex, executeItem, onClose],
  );

  // Scroll selected item into view
  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current?.querySelector('[data-selected="true"]');
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedIndex, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-surface-overlay flex items-start justify-center pt-[20vh] z-modal-backdrop animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-surface-raised border border-edge rounded-lg shadow-modal w-full max-w-xl animate-scale-in flex flex-col"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-edge-subtle">
          <Search className={`${iconSize.sm} text-fg-faint shrink-0`} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search tasks, projects, actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-fg placeholder-fg-faint text-body-sm outline-none"
            autoFocus
          />
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-96 overflow-y-auto py-1">
          {flatItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-fg-faint text-body-sm">No results</div>
          ) : (
            sections.map((section) => (
              <div key={section.label}>
                <div className="px-4 py-1.5 text-fg-faint text-label-xs uppercase tracking-wider">
                  {section.label}
                </div>
                {section.items.map((item) => {
                  const idx = flatIndexMap.get(item.id) ?? 0;
                  return (
                    <ResultItem
                      key={item.id}
                      item={item}
                      isSelected={idx === selectedIndex}
                      onClick={() => executeItem(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-edge-subtle text-fg-faint text-label-xs">
          <span>
            <kbd className="px-1 py-0.5 bg-surface-inset border border-edge-subtle rounded text-label-xs">
              &uarr;&darr;
            </kbd>{' '}
            navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-surface-inset border border-edge-subtle rounded text-label-xs">
              &crarr;
            </kbd>{' '}
            select
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-surface-inset border border-edge-subtle rounded text-label-xs">
              esc
            </kbd>{' '}
            close
          </span>
        </div>
      </div>
    </div>
  );
}

function ResultItem({
  item,
  isSelected,
  onClick,
  onMouseEnter,
}: {
  item: PaletteItem;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      type="button"
      data-selected={isSelected}
      className={`w-full flex items-center gap-2 px-4 py-2 text-left text-body-sm transition-colors ${
        isSelected ? 'bg-surface-hover text-fg' : 'text-fg hover:bg-surface-hover'
      }`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <ItemIcon item={item} />
      <ItemContent item={item} />
    </button>
  );
}

function ItemIcon({ item }: { item: PaletteItem }) {
  switch (item.type) {
    case 'task':
      return <StatusIcon status={item.status} />;
    case 'project':
      return <Folder className={`${iconSize.sm} text-fg-muted`} />;
    case 'initiative':
      return <Target className={`${iconSize.sm} text-fg-muted`} />;
    case 'action':
      return <ActionIcon actionId={item.actionId} />;
  }
}

function ActionIcon({ actionId }: { actionId: ActionId }) {
  switch (actionId) {
    case 'create-task':
    case 'create-project':
      return <Plus className={`${iconSize.sm} text-fg-muted`} />;
    case 'my-tasks':
      return <User className={`${iconSize.sm} text-fg-muted`} />;
    case 'settings':
      return <Settings className={`${iconSize.sm} text-fg-muted`} />;
    case 'members':
      return <Users className={`${iconSize.sm} text-fg-muted`} />;
    case 'keyboard-shortcuts':
      return <Keyboard className={`${iconSize.sm} text-fg-muted`} />;
  }
}

function ItemContent({ item }: { item: PaletteItem }) {
  switch (item.type) {
    case 'task':
      return (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="font-mono text-fg-faint text-code-xs shrink-0">{item.displayId}</span>
          <span className="truncate">{item.label}</span>
          {item.projectName && (
            <span className="text-fg-faint text-label-xs shrink-0">{item.projectName}</span>
          )}
        </div>
      );
    case 'action':
      return (
        <div className="flex-1 flex items-center justify-between min-w-0">
          <span className="truncate">{item.label}</span>
          {item.shortcut && (
            <kbd className="px-1.5 py-0.5 bg-surface-inset border border-edge-subtle rounded text-fg-faint text-label-xs shrink-0">
              {item.shortcut}
            </kbd>
          )}
        </div>
      );
    default:
      return <span className="flex-1 truncate">{item.label}</span>;
  }
}
