import { Check, X } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { ReviewStatus } from '../../graphql/__generated__/generated.js';

interface ReviewIndicatorProps {
  status: ReviewStatus;
}

export function ReviewIndicator({ status }: ReviewIndicatorProps) {
  if (status === ReviewStatus.Approved) {
    return <Check className={`${iconSize.sm} text-success`} aria-label="Approved" />;
  }
  if (status === ReviewStatus.ChangesRequested) {
    return <X className={`${iconSize.sm} text-error`} aria-label="Changes requested" />;
  }
  return null;
}
