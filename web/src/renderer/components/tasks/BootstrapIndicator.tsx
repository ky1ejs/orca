import { useState, useRef, useEffect } from 'react';
import type { BootstrapStatus } from '../../hooks/useBootstrapStatus.js';

interface BootstrapIndicatorProps {
  status: BootstrapStatus;
}

export function BootstrapIndicator({ status }: BootstrapIndicatorProps) {
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (showPopover && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [status.lines.length, showPopover]);

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPopover]);

  // Clean up hover timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  if (status.state === 'idle' || status.state === 'completed') return null;

  const isRunning = status.state === 'running';
  const isFailed = status.state === 'failed';

  const dotClass = isRunning ? 'bg-info animate-pulse' : 'bg-error';
  const textClass = isRunning ? 'text-fg-muted' : 'text-error';
  const label = isRunning ? 'Setting up...' : 'Setup failed';

  return (
    <div className="relative" ref={popoverRef}>
      <button
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${textClass} hover:bg-surface-hover transition-colors`}
        onClick={() => setShowPopover((prev) => !prev)}
        onMouseEnter={() => setShowPopover(true)}
        onMouseLeave={() => {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = setTimeout(() => {
            hoverTimerRef.current = null;
            if (!popoverRef.current?.matches(':hover')) {
              setShowPopover(false);
            }
          }, 200);
        }}
        data-testid="bootstrap-indicator"
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`} />
        {label}
      </button>
      {showPopover && (status.lines.length > 0 || status.error) && (
        <div
          className="absolute top-full right-0 mt-1 bg-surface-overlay border border-edge-subtle rounded-md shadow-lg z-20 w-[400px] animate-slide-up"
          onMouseEnter={() => setShowPopover(true)}
          onMouseLeave={() => setShowPopover(false)}
        >
          <div className="px-3 py-1.5 border-b border-edge-subtle text-[11px] text-fg-muted font-medium">
            {isRunning ? 'Bootstrap in progress' : 'Bootstrap failed'}
          </div>
          <div
            ref={scrollRef}
            className="max-h-[200px] overflow-y-auto p-2 font-mono text-[11px] text-fg-muted leading-relaxed"
          >
            {status.lines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))}
            {isFailed && status.error && (
              <div className="mt-2 text-error whitespace-pre-wrap break-all border-t border-edge-subtle pt-2">
                {status.error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
