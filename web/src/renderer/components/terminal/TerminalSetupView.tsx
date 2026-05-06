import { useEffect, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { iconSize, iconStroke } from '../../tokens/icon-size.js';
import type { BootstrapStatus } from '../../hooks/useBootstrapStatus.js';

const VISIBLE_LINE_COUNT = 5;

interface TerminalSetupViewProps {
  status: BootstrapStatus;
  launching: boolean;
}

export function TerminalSetupView({ status, launching }: TerminalSetupViewProps) {
  const failed = status.state === 'failed';
  const tail = status.lines.slice(-VISIBLE_LINE_COUNT);
  const tailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tailRef.current) {
      tailRef.current.scrollTop = tailRef.current.scrollHeight;
    }
  }, [status.lines.length]);

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-hidden"
      data-testid="terminal-setup-view"
    >
      <div className="mb-3 text-fg-faint">
        {failed ? (
          <AlertCircle
            className={iconSize.lg}
            strokeWidth={iconStroke.lg}
            data-testid="terminal-setup-icon-failed"
          />
        ) : (
          <Loader2
            className={`${iconSize.lg} animate-spin`}
            strokeWidth={iconStroke.lg}
            data-testid="terminal-setup-icon-running"
          />
        )}
      </div>
      <h3 className="text-heading-sm font-medium text-fg-muted mb-2">
        {failed
          ? 'Setup failed'
          : launching
            ? 'Starting your terminal\u2026'
            : 'Setting up your terminal\u2026'}
      </h3>
      <p className="text-body-sm text-fg-faint max-w-md text-center mb-4">
        {failed
          ? 'The bootstrap script did not finish successfully.'
          : "Your terminal will appear here when it's ready."}
      </p>

      {tail.length > 0 && (
        <div
          ref={tailRef}
          className="w-full max-w-2xl bg-surface-hover border border-edge-subtle rounded-md px-3 py-2 font-mono text-[11px] text-fg-muted leading-relaxed max-h-[120px] overflow-y-auto"
          data-testid="terminal-setup-tail"
        >
          {tail.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))}
        </div>
      )}

      {failed && status.error && (
        <pre
          className="mt-3 w-full max-w-2xl text-error text-[11px] font-mono whitespace-pre-wrap break-all max-h-[120px] overflow-y-auto"
          data-testid="terminal-setup-error"
        >
          {status.error}
        </pre>
      )}
    </div>
  );
}
