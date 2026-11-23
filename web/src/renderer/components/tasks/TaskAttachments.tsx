import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fetchAttachment } from '../../graphql/client.js';
import { iconSize } from '../../tokens/icon-size.js';
import { TaskSectionHeading } from './TaskSectionHeading.js';

interface TaskAttachmentItem {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
}

/**
 * Loads an attachment with the session token and returns an object URL for
 * it. The app's content security policy allows `blob:` images, not the
 * backend's origin, so images can't load from a plain URL.
 */
function useAttachmentObjectUrl(attachmentId: string) {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({
    url: null,
    failed: false,
  });

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    fetchAttachment(attachmentId).then(
      (blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ url, failed: false });
      },
      () => {
        if (!cancelled) setState({ url: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachmentId]);

  return state;
}

function AttachmentThumbnail({
  attachment,
  onOpen,
}: {
  attachment: TaskAttachmentItem;
  onOpen: (url: string) => void;
}) {
  const { url, failed } = useAttachmentObjectUrl(attachment.id);

  return (
    <li>
      <button
        type="button"
        onClick={() => url && onOpen(url)}
        disabled={!url}
        className="block w-32 h-32 rounded-md border border-edge-subtle bg-surface-inset overflow-hidden hover:border-edge transition-colors disabled:cursor-default"
        aria-label={`Open ${attachment.filename}`}
        data-testid={`attachment-${attachment.id}`}
      >
        {url ? (
          <img src={url} alt={attachment.filename} className="w-full h-full object-cover" />
        ) : (
          <span className="flex items-center justify-center w-full h-full text-label-sm text-fg-faint p-2 text-center">
            {failed ? "Couldn't load" : 'Loading...'}
          </span>
        )}
      </button>
    </li>
  );
}

/** Screenshots and other images attached to a task, opened full size on click. */
export function TaskAttachments({ attachments }: { attachments: TaskAttachmentItem[] }) {
  const [openUrl, setOpenUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!openUrl) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenUrl(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openUrl]);

  if (attachments.length === 0) return null;

  return (
    <section aria-labelledby="task-attachments-heading">
      <TaskSectionHeading
        id="task-attachments-heading"
        title="Attachments"
        count={attachments.length}
      />
      <ul className="flex flex-wrap gap-3">
        {attachments.map((attachment) => (
          <AttachmentThumbnail key={attachment.id} attachment={attachment} onOpen={setOpenUrl} />
        ))}
      </ul>

      {openUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Attachment"
          className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-surface-overlay p-8 animate-fade-in"
          onClick={() => setOpenUrl(null)}
          data-testid="attachment-viewer"
        >
          <img src={openUrl} alt="" className="max-w-full max-h-full object-contain rounded-md" />
          <button
            type="button"
            autoFocus
            onClick={() => setOpenUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-md bg-surface-raised text-fg hover:bg-surface-hover"
            aria-label="Close"
          >
            <X className={iconSize.sm} />
          </button>
        </div>
      )}
    </section>
  );
}
