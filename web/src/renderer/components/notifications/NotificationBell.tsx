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
        className="text-gray-400 hover:text-white transition-colors p-1 relative"
        aria-label="Notifications"
        data-testid="notification-bell"
      >
        <Bell className={iconSize.sm} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-error text-white text-label-xs font-bold font-mono rounded-full h-3.5 w-3.5 flex items-center justify-center">
            {count}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 bg-surface-secondary border border-gray-700 rounded-md shadow-dropdown z-dropdown w-72 left-0 animate-slide-up">
          <div className="px-3 py-2 border-b border-gray-700 text-label-sm font-medium text-gray-400 uppercase tracking-wide">
            Invitations
          </div>
          <InvitationList invitations={invitations} />
        </div>
      )}
    </div>
  );
}
