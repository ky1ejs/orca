import { useState, useRef, useEffect } from 'react';
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
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center">
            {count}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-50 w-72 left-0">
          <div className="px-3 py-2 border-b border-gray-700 text-xs font-medium text-gray-400 uppercase tracking-wide">
            Invitations
          </div>
          <InvitationList invitations={invitations} />
        </div>
      )}
    </div>
  );
}
