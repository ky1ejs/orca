import { Monitor } from 'lucide-react';

interface DesktopOnlyPlaceholderProps {
  feature: string;
  detail?: string;
  className?: string;
}

export function DesktopOnlyPlaceholder({
  feature,
  detail,
  className,
}: DesktopOnlyPlaceholderProps) {
  return (
    <div
      className={
        className ?? 'flex flex-1 flex-col items-center justify-center p-8 text-center min-h-0'
      }
    >
      <Monitor className="w-10 h-10 text-fg-faint mb-3" />
      <p className="text-fg-muted text-body-sm">{feature} is only available in the desktop app</p>
      {detail && <p className="text-fg-faint text-body-xs mt-1 max-w-sm">{detail}</p>}
    </div>
  );
}
