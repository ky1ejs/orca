// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockFetchAttachment = vi.fn();

vi.mock('../../graphql/client.js', () => ({
  fetchAttachment: (id: string, signal?: AbortSignal) => mockFetchAttachment(id, signal),
}));

const ATTACHMENTS = [
  { id: 'a1', filename: 'screenshot-1.png', mimeType: 'image/png', byteSize: 100 },
  { id: 'a2', filename: 'screenshot-2.png', mimeType: 'image/png', byteSize: 200 },
];

beforeEach(() => {
  let next = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${++next}`);
  URL.revokeObjectURL = vi.fn();
  mockFetchAttachment.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function importAndRender(attachments = ATTACHMENTS) {
  const { TaskAttachments } = await import('./TaskAttachments.js');
  const result = render(<TaskAttachments attachments={attachments} />);
  return {
    ...result,
    rerenderWith: (next: typeof ATTACHMENTS) =>
      result.rerender(<TaskAttachments attachments={next} />),
  };
}

async function openFirst() {
  await waitFor(() => screen.getByRole('img', { name: 'screenshot-1.png' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open screenshot-1.png' }));
}

describe('TaskAttachments', () => {
  it('renders nothing for a task without attachments', async () => {
    const { container } = await importAndRender([]);
    expect(container).toBeEmptyDOMElement();
    expect(mockFetchAttachment).not.toHaveBeenCalled();
  });

  it('downloads each attachment and shows it from a blob URL', async () => {
    await importAndRender();
    expect(screen.getByText('Attachments')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'screenshot-1.png' })).toHaveAttribute(
        'src',
        expect.stringMatching(/^blob:/),
      ),
    );
    expect(mockFetchAttachment).toHaveBeenCalledWith('a1', expect.any(AbortSignal));
    expect(mockFetchAttachment).toHaveBeenCalledWith('a2', expect.any(AbortSignal));
  });

  it('retries a failed attachment when clicked', async () => {
    mockFetchAttachment.mockRejectedValueOnce(new Error('502'));
    await importAndRender([ATTACHMENTS[0]]);
    await waitFor(() => expect(screen.getByText(/Couldn't load/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading screenshot-1.png' }));

    await waitFor(() => screen.getByRole('img', { name: 'screenshot-1.png' }));
    expect(mockFetchAttachment).toHaveBeenCalledTimes(2);
  });

  it('opens an attachment in a named dialog and returns focus on Escape', async () => {
    await importAndRender([ATTACHMENTS[0]]);
    await openFirst();

    expect(screen.getByRole('dialog', { name: 'screenshot-1.png' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByTestId('attachment-viewer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open screenshot-1.png' })).toHaveFocus();
  });

  it('keeps app shortcuts and Tab from reaching the page while open', async () => {
    const shortcut = vi.fn();
    document.addEventListener('keydown', shortcut, true);
    await importAndRender([ATTACHMENTS[0]]);
    await openFirst();

    fireEvent.keyDown(document.activeElement!, { key: 'k', metaKey: true });
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });

    expect(shortcut).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    document.removeEventListener('keydown', shortcut, true);
  });

  it('closes the viewer when its attachment leaves the list', async () => {
    const { rerenderWith } = await importAndRender();
    await openFirst();
    expect(screen.getByTestId('attachment-viewer')).toBeInTheDocument();

    rerenderWith([ATTACHMENTS[1]]);

    await waitFor(() => expect(screen.queryByTestId('attachment-viewer')).not.toBeInTheDocument());
  });

  it('aborts downloads and frees the blob URLs when it unmounts', async () => {
    const { unmount } = await importAndRender([ATTACHMENTS[0]]);
    await waitFor(() => screen.getByRole('img', { name: 'screenshot-1.png' }));
    const signal = mockFetchAttachment.mock.calls[0][1] as AbortSignal;

    unmount();

    expect(signal.aborted).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
  });
});
