import { useState, memo } from 'react';
import { ExternalLink, X, Plus, Link, Loader2 } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { type TaskQuery } from '../../graphql/__generated__/generated.js';
import { CIStatusBadge } from './CIStatusBadge.js';
import { PullRequestBadge } from './PullRequestBadge.js';
import { PullRequestIcon } from './PullRequestIcon.js';
import { ReviewIndicator } from './ReviewIndicator.js';
import { useUnlinkPullRequest } from '../../hooks/useGraphQL.js';
import { useLinkPrForm } from '../../hooks/useLinkPrForm.js';

type PullRequestItem = NonNullable<TaskQuery['task']>['pullRequests'][number];

interface PullRequestListProps {
  pullRequests: PullRequestItem[];
  taskId: string;
  onMutate?: () => void;
}

export const PullRequestList = memo(function PullRequestList({
  pullRequests,
  taskId,
  onMutate,
}: PullRequestListProps) {
  const { showForm, setShowForm, url, setUrl, linkError, linking, handleCancel, handleLink } =
    useLinkPrForm({ taskId, onSuccess: onMutate });
  const { unlinkPullRequest, fetching: unlinking } = useUnlinkPullRequest();
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  const handleUnlink = async (id: string) => {
    const result = await unlinkPullRequest(id);
    if (result.error) {
      setUnlinkError(result.error.graphQLErrors[0]?.message ?? result.error.message);
      return;
    }
    onMutate?.();
  };

  return (
    <div>
      <span className="text-fg-faint text-label-md block mb-2">Pull Requests</span>
      {pullRequests.length > 0 && (
        <div className="space-y-2">
          {pullRequests.map((pr) => (
            <div
              key={pr.id}
              className="group flex items-center gap-2 px-3 py-2 bg-surface-raised rounded-md border border-edge"
            >
              <PullRequestIcon status={pr.status} className={iconSize.sm} />
              <a
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-fg hover:text-accent text-body-sm font-medium transition-colors inline-flex items-center gap-1 min-w-0"
              >
                <span className="text-fg-faint">#{pr.number}</span>
                <span className="truncate">{pr.title}</span>
                <ExternalLink className={`${iconSize.xs} flex-shrink-0 text-fg-faint`} />
              </a>
              <div className="flex-1" />
              <ReviewIndicator status={pr.reviewStatus} />
              <CIStatusBadge status={pr.checkStatus} />
              <PullRequestBadge status={pr.status} draft={pr.draft} />
              <span className="text-fg-faint text-label-sm flex-shrink-0">{pr.repository}</span>
              <span className="text-fg-muted text-label-sm flex-shrink-0">{pr.author}</span>
              <button
                onClick={() => handleUnlink(pr.id)}
                disabled={unlinking}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-fg-faint hover:text-error transition-all rounded"
                title="Unlink pull request"
              >
                <X className={iconSize.xs} />
              </button>
            </div>
          ))}
        </div>
      )}
      {showForm ? (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <Link className={`${iconSize.sm} text-fg-faint flex-shrink-0`} />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLink();
                if (e.key === 'Escape') handleCancel();
              }}
              placeholder="https://github.com/owner/repo/pull/123"
              className="flex-1 px-3 py-1.5 bg-surface-inset border border-edge-subtle rounded-md text-fg text-body-sm placeholder-fg-faint focus:outline-none focus:border-accent"
              autoFocus
            />
            <button
              onClick={handleLink}
              disabled={linking || !url.trim()}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent text-label-md rounded-md transition-colors disabled:opacity-50 inline-flex items-center gap-1"
            >
              {linking && <Loader2 className={`${iconSize.xs} animate-spin`} />}
              Link
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 bg-surface-hover hover:bg-surface-overlay text-fg text-label-md rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="mt-2 text-fg-muted hover:text-fg text-label-md transition-colors inline-flex items-center gap-1"
        >
          <Plus className={iconSize.xs} />
          Link Pull Request
        </button>
      )}
      {(linkError || unlinkError) && (
        <p className="text-error text-label-sm mt-1">{linkError ?? unlinkError}</p>
      )}
    </div>
  );
});
