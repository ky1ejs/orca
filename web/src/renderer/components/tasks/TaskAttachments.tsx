import { useCallback, useEffect, useRef, useState } from 'react';
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

type AttachmentImage = { url: string; failed: false } | { url: null; failed: boolean };

/**
 * Downloads the attachments with the session token and returns an object URL
 * for each. The app's content security policy allows `blob:` images, not the
 * backend's origin, so images can't load from a plain URL.
 *
 * This component owns every URL: a change to the list, or unmounting, aborts
 * the downloads and revokes the URLs together, so nothing can show a revoked
 * image. `retry` downloads them again.
 */
function useAttachmentImages(attachmentIds: string[]) {
  const [images, setImages] = useState<Record<string, AttachmentImage>>({});
  const [generation, setGeneration] = useState(0);
  const idsKey = attachmentIds.join('\n');

  useEffect(() => {
    const ids = idsKey ? idsKey.split('\n') : [];
    const controller = new AbortController();
    const urls: string[] = [];
    setImages({});
    for (const id of ids) {
      fetchAttachment(id, controller.signal).then(
        (blob) => {
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          setImages((current) => ({ ...current, [id]: { url, failed: false } }));
        },
        () => {
          if (controller.signal.aborted) return;
          setImages((current) => ({ ...current, [id]: { url: null, failed: true } }));
        },
      );
    }
    return () => {
      controller.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [idsKey, generation]);

  const retry = useCallback(() => setGeneration((g) => g + 1), []);
  return { images, retry };
}

function AttachmentViewer({
  attachment,
  url,
  onClose,
}: {
  attachment: TaskAttachmentItem;
  url: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    // Capture on window runs before the app's shortcut listener on document,
    // so while the viewer is open no shortcut reaches the page behind it.
    const onKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        // Close is the only control, so focus stays on it.
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.filename}
      className="fixed inset-0 z-modal-backdrop flex items-center justify-center bg-surface-overlay p-8 animate-fade-in"
      onClick={onClose}
      data-testid="attachment-viewer"
    >
      <img
        src={url}
        alt={attachment.filename}
        className="max-w-full max-h-full object-contain rounded-md"
      />
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-md bg-surface-raised text-fg hover:bg-surface-hover"
        aria-label="Close"
      >
        <X className={iconSize.sm} />
      </button>
    </div>
  );
}

/** Screenshots and other images attached to a task, opened full size on click. */
export function TaskAttachments({ attachments }: { attachments: TaskAttachmentItem[] }) {
  const { images, retry } = useAttachmentImages(attachments.map((a) => a.id));
  const [openId, setOpenId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const openAttachment = attachments.find((a) => a.id === openId);
  const openUrl = openId ? images[openId]?.url : null;

  // Close the viewer if its attachment is no longer in the list, or its image
  // is gone (for example after the list was reloaded).
  useEffect(() => {
    if (openId && (!openAttachment || !openUrl)) setOpenId(null);
  }, [openId, openAttachment, openUrl]);

  const closeViewer = useCallback(() => {
    setOpenId(null);
    openerRef.current?.focus();
  }, []);

  if (attachments.length === 0) return null;

  return (
    <section aria-labelledby="task-attachments-heading">
      <TaskSectionHeading
        id="task-attachments-heading"
        title="Attachments"
        count={attachments.length}
      />
      <ul className="flex flex-wrap gap-3">
        {attachments.map((attachment) => {
          const image = images[attachment.id];
          const url = image?.url ?? null;
          const failed = image?.failed ?? false;
          return (
            <li key={attachment.id}>
              <button
                type="button"
                onClick={(e) => {
                  if (url) {
                    openerRef.current = e.currentTarget;
                    setOpenId(attachment.id);
                  } else if (failed) {
                    retry();
                  }
                }}
                disabled={!url && !failed}
                className="block w-32 h-32 rounded-md border border-edge-subtle bg-surface-inset overflow-hidden hover:border-edge transition-colors disabled:cursor-default"
                aria-label={
                  failed ? `Retry loading ${attachment.filename}` : `Open ${attachment.filename}`
                }
                data-testid={`attachment-${attachment.id}`}
              >
                {url ? (
                  <img src={url} alt={attachment.filename} className="w-full h-full object-cover" />
                ) : (
                  <span className="flex items-center justify-center w-full h-full text-label-sm text-fg-faint p-2 text-center">
                    {failed ? "Couldn't load. Click to retry" : 'Loading...'}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {openAttachment && openUrl && (
        <AttachmentViewer attachment={openAttachment} url={openUrl} onClose={closeViewer} />
      )}
    </section>
  );
}
