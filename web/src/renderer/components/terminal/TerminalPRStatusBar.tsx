import { ExternalLink, Plus, Link, Loader2 } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { type TaskQuery } from '../../graphql/__generated__/generated.js';
import { PullRequestBadge } from '../tasks/PullRequestBadge.js';
import { CIStatusBadge } from '../tasks/CIStatusBadge.js';
import { PullRequestIcon } from '../tasks/PullRequestIcon.js';
import { ReviewIndicator } from '../tasks/ReviewIndicator.js';
import { useLinkPrForm } from '../../hooks/useLinkPrForm.js';

type PullRequestItem = NonNullable<TaskQuery['task']>['pullRequests'][number];

interface TerminalPRStatusBarProps {
  pullRequests: PullRequestItem[];
  taskId: string;
  onMutate?: () => void;
}

export function TerminalPRStatusBar({ pullRequests, taskId, onMutate }: TerminalPRStatusBarProps) {
  const { showForm, setShowForm, url, setUrl, linkError, linking, handleCancel, handleLink } =
    useLinkPrForm({ taskId, onSuccess: onMutate });

  return (
    <div className="bg-surface-raised border-b border-edge px-3 py-1.5 flex items-center gap-3 overflow-x-auto">
      {pullRequests.length > 0 ? (
        pullRequests.map((pr) => (
          <a
            key={pr.id}
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-label-sm whitespace-nowrap hover:text-accent transition-colors shrink-0"
          >
            <PullRequestIcon status={pr.status} className={iconSize.xs} />
            <span className="text-fg-faint">#{pr.number}</span>
            <span className="text-fg font-medium max-w-48 truncate">{pr.title}</span>
            <PullRequestBadge status={pr.status} draft={pr.draft} />
            <CIStatusBadge status={pr.checkStatus} />
            <ReviewIndicator status={pr.reviewStatus} />
            <ExternalLink className={`${iconSize.xs} text-fg-faint`} />
          </a>
        ))
      ) : (
        <span className="text-fg-faint text-label-sm">No pull requests</span>
      )}

      <div className="flex-1" />

      {showForm ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <Link className={`${iconSize.xs} text-fg-faint`} />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLink();
              if (e.key === 'Escape') handleCancel();
            }}
            placeholder="https://github.com/owner/repo/pull/123"
            className="w-72 px-2 py-0.5 bg-surface-inset border border-edge-subtle rounded text-fg text-label-sm placeholder-fg-faint focus:outline-none focus:border-accent"
            autoFocus
          />
          <button
            onClick={handleLink}
            disabled={linking || !url.trim()}
            className="px-2 py-0.5 bg-accent hover:bg-accent-hover text-on-accent text-label-sm rounded transition-colors disabled:opacity-50 inline-flex items-center gap-1"
          >
            {linking && <Loader2 className={`${iconSize.xs} animate-spin`} />}
            Link
          </button>
          <button
            onClick={handleCancel}
            className="px-2 py-0.5 bg-surface-hover hover:bg-surface-overlay text-fg text-label-sm rounded transition-colors"
          >
            Cancel
          </button>
          {linkError && <span className="text-error text-label-sm">{linkError}</span>}
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="text-fg-muted hover:text-fg text-label-sm transition-colors inline-flex items-center gap-1 shrink-0"
          title="Link Pull Request"
        >
          <Plus className={iconSize.xs} />
          <span>Link PR</span>
        </button>
      )}
    </div>
  );
}
