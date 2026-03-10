import { useState } from 'react';
import { GitPullRequest, ExternalLink, Check, X, Plus, Link, Loader2 } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import {
  PullRequestStatus,
  ReviewStatus,
  type TaskQuery,
} from '../../graphql/__generated__/generated.js';
import { PullRequestBadge } from './PullRequestBadge.js';
import { useLinkPullRequest, useUnlinkPullRequest } from '../../hooks/useGraphQL.js';

type PullRequestItem = NonNullable<TaskQuery['task']>['pullRequests'][number];

interface PullRequestListProps {
  pullRequests: PullRequestItem[];
  taskId: string;
  onMutate?: () => void;
}

function ReviewIndicator({ status }: { status: ReviewStatus }) {
  if (status === ReviewStatus.Approved) {
    return <Check className={`${iconSize.sm} text-success`} aria-label="Approved" />;
  }
  if (status === ReviewStatus.ChangesRequested) {
    return <X className={`${iconSize.sm} text-error`} aria-label="Changes requested" />;
  }
  return null;
}

export function PullRequestList({ pullRequests, taskId, onMutate }: PullRequestListProps) {
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const { linkPullRequest, fetching: linking } = useLinkPullRequest();
  const { unlinkPullRequest, fetching: unlinking } = useUnlinkPullRequest();

  const handleCancel = () => {
    setShowForm(false);
    setUrl('');
    setLinkError(null);
  };

  const handleLink = async () => {
    if (!url.trim()) return;
    setLinkError(null);
    const result = await linkPullRequest({ taskId, url: url.trim() });
    if (result.error) {
      setLinkError(result.error.graphQLErrors[0]?.message ?? result.error.message);
      return;
    }
    handleCancel();
    onMutate?.();
  };

  const handleUnlink = async (id: string) => {
    const result = await unlinkPullRequest(id);
    if (result.error) {
      setLinkError(result.error.graphQLErrors[0]?.message ?? result.error.message);
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
              <GitPullRequest
                className={`${iconSize.sm} flex-shrink-0 ${
                  pr.status === PullRequestStatus.Merged
                    ? 'text-accent'
                    : pr.status === PullRequestStatus.Closed
                      ? 'text-fg-muted'
                      : 'text-success'
                }`}
              />
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
              onChange={(e) => {
                setUrl(e.target.value);
                setLinkError(null);
              }}
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
          {linkError && <p className="text-error text-label-sm mt-1">{linkError}</p>}
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
    </div>
  );
}
