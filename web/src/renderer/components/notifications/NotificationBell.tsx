import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { usePendingInvitations } from '../../hooks/useGraphQL.js';
import { InvitationList } from './InvitationList.js';

export function NotificationBell() {
  const { data } = usePendingInvitations();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const invitations = data?.pendingInvitations ?? [];
  const count = invitations.length;

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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-fg-muted hover:text-fg transition-colors p-1 relative"
        aria-label="Notifications"
        data-testid="notification-bell"
      >
        <Bell className={iconSize.sm} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-error text-fg text-label-xs font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center">
            {count}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 bg-surface-overlay border border-edge-subtle rounded-md shadow-lg z-10 w-72 left-0 animate-slide-up">
          <div className="px-3 py-2 border-b border-edge-subtle text-label-sm font-medium text-fg-muted uppercase tracking-wide">
            Invitations
          </div>
          <InvitationList invitations={invitations} />
        </div>
      )}
    </div>
  );
}
