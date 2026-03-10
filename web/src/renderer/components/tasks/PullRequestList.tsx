import { GitPullRequest, ExternalLink, Check, X } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import {
  PullRequestStatus,
  ReviewStatus,
  type TaskQuery,
} from '../../graphql/__generated__/generated.js';
import { PullRequestBadge } from './PullRequestBadge.js';

type PullRequestItem = NonNullable<TaskQuery['task']>['pullRequests'][number];

interface PullRequestListProps {
  pullRequests: PullRequestItem[];
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

export function PullRequestList({ pullRequests }: PullRequestListProps) {
  if (pullRequests.length === 0) return null;

  return (
    <div>
      <span className="text-fg-faint text-label-md block mb-2">Pull Requests</span>
      <div className="space-y-2">
        {pullRequests.map((pr) => (
          <div
            key={pr.id}
            className="flex items-center gap-2 px-3 py-2 bg-surface-raised rounded-md border border-edge"
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
          </div>
        ))}
      </div>
    </div>
  );
}
