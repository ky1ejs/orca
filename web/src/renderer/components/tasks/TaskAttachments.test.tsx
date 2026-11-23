// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mockFetchAttachment = vi.fn();

vi.mock('../../graphql/client.js', () => ({
  fetchAttachment: (id: string) => mockFetchAttachment(id),
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
  return render(<TaskAttachments attachments={attachments} />);
}

describe('TaskAttachments', () => {
  it('renders nothing for a task without attachments', async () => {
    const { container } = await importAndRender([]);
    expect(container).toBeEmptyDOMElement();
    expect(mockFetchAttachment).not.toHaveBeenCalled();
  });

  it('loads each attachment with the session and shows it from a blob URL', async () => {
    await importAndRender();
    expect(screen.getByText('Attachments')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'screenshot-1.png' })).toHaveAttribute(
        'src',
        expect.stringMatching(/^blob:/),
      ),
    );
    expect(mockFetchAttachment).toHaveBeenCalledWith('a1');
    expect(mockFetchAttachment).toHaveBeenCalledWith('a2');
  });

  it('says when an attachment fails to load', async () => {
    mockFetchAttachment.mockRejectedValueOnce(new Error('404'));
    await importAndRender([ATTACHMENTS[0]]);
    await waitFor(() => expect(screen.getByText("Couldn't load")).toBeInTheDocument());
  });

  it('opens an attachment full size and closes it with Escape', async () => {
    await importAndRender([ATTACHMENTS[0]]);
    await waitFor(() => screen.getByRole('img', { name: 'screenshot-1.png' }));

    fireEvent.click(screen.getByRole('button', { name: 'Open screenshot-1.png' }));
    expect(screen.getByTestId('attachment-viewer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('attachment-viewer')).not.toBeInTheDocument();
  });

  it('frees the blob URLs when it unmounts', async () => {
    const { unmount } = await importAndRender([ATTACHMENTS[0]]);
    await waitFor(() => screen.getByRole('img', { name: 'screenshot-1.png' }));
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
  });
});
