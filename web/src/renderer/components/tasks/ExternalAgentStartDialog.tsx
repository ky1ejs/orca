interface ExternalAgentStartDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Asks before an agent starts on an external task, whose text came from
 * another service through the Orca API. Cancel has focus, so pressing Enter
 * doesn't start the agent by accident.
 */
export function ExternalAgentStartDialog({ onConfirm, onCancel }: ExternalAgentStartDialogProps) {
  return (
    <div className="fixed inset-0 bg-surface-overlay flex items-center justify-center z-modal-backdrop animate-fade-in">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="external-agent-start-title"
        aria-describedby="external-agent-start-description"
        className="bg-surface-raised border border-edge-subtle rounded-lg p-6 max-w-md mx-4 shadow-modal animate-scale-in"
        data-testid="external-agent-start-dialog"
      >
        <h2 id="external-agent-start-title" className="text-heading-sm font-semibold text-fg mb-2">
          Start an agent on an external task?
        </h2>
        <p id="external-agent-start-description" className="text-body-sm text-fg-muted mb-4">
          Another service created this task through the Orca API. Its title, description and
          attachments are untrusted input, and the agent will read them. Check them for instructions
          aimed at the agent before you start it.
        </p>
        <div className="flex justify-end gap-2">
          <button
            autoFocus
            onClick={onCancel}
            className="px-3 py-1.5 text-label-md text-fg-muted hover:text-fg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-label-md bg-warning-muted hover:bg-warning-strong text-warning rounded transition-colors"
            data-testid="external-agent-start-confirm"
          >
            Start agent
          </button>
        </div>
      </div>
    </div>
  );
}
