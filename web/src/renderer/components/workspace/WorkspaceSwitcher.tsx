import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { useWorkspace } from '../../workspace/context.js';
import { useNavigation } from '../../navigation/context.js';
import { CreateWorkspaceModal } from './CreateWorkspaceModal.js';

export function WorkspaceSwitcher() {
  const { currentWorkspace, workspaces, switchWorkspace } = useWorkspace();
  const { navigate } = useNavigation();
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  if (!currentWorkspace) return null;

  const handleSwitch = (slug: string) => {
    switchWorkspace(slug);
    navigate({ view: 'projects' });
    setIsOpen(false);
  };

  return (
    <div className="relative px-2 py-2 border-b border-edge" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-body-sm text-fg-muted hover:bg-surface-hover rounded transition-colors"
        data-testid="workspace-switcher"
      >
        <span className="truncate font-medium">{currentWorkspace.name}</span>
        <ChevronDown
          className={`${iconSize.sm} text-fg-faint transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-2 right-2 top-full mt-1 bg-surface-overlay border border-edge-subtle rounded-md shadow-lg z-10 overflow-hidden animate-slide-up">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => handleSwitch(ws.slug)}
              className={`w-full text-left px-3 py-2 text-body-sm transition-colors ${
                ws.id === currentWorkspace.id
                  ? 'bg-surface-hover text-fg'
                  : 'text-fg-muted hover:bg-surface-hover'
              }`}
            >
              {ws.name}
            </button>
          ))}
          <div className="border-t border-edge-subtle">
            <button
              onClick={() => {
                setIsOpen(false);
                setShowCreateModal(true);
              }}
              className="w-full text-left px-3 py-2 text-body-sm text-fg-muted hover:bg-surface-hover hover:text-fg-muted transition-colors flex items-center"
            >
              <Plus className={`${iconSize.sm} mr-1`} />
              Create Workspace
            </button>
          </div>
        </div>
      )}

      {showCreateModal && <CreateWorkspaceModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}
