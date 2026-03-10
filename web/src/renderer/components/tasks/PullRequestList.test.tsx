// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PullRequestStatus, ReviewStatus } from '../../graphql/__generated__/generated.js';

const mockLinkPullRequest = vi.fn().mockResolvedValue({ data: { linkPullRequest: {} } });
const mockUnlinkPullRequest = vi.fn().mockResolvedValue({ data: { unlinkPullRequest: true } });

vi.mock('../../hooks/useGraphQL.js', () => ({
  useLinkPullRequest: () => ({
    linkPullRequest: mockLinkPullRequest,
    fetching: false,
  }),
  useUnlinkPullRequest: () => ({
    unlinkPullRequest: mockUnlinkPullRequest,
    fetching: false,
  }),
}));

const MOCK_PR = {
  id: 'pr-1',
  number: 42,
  title: 'Fix the thing',
  url: 'https://github.com/acme/repo/pull/42',
  status: PullRequestStatus.Open,
  reviewStatus: ReviewStatus.None,
  repository: 'acme/repo',
  headBranch: 'fix/the-thing',
  author: 'octocat',
  draft: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function importAndRender(pullRequests = [MOCK_PR], taskId = 'task-1', onMutate?: () => void) {
  const { PullRequestList } = await import('./PullRequestList.js');
  return render(
    <PullRequestList pullRequests={pullRequests} taskId={taskId} onMutate={onMutate} />,
  );
}

describe('PullRequestList', () => {
  it('renders the PR list with PR details', async () => {
    await importAndRender();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText('Fix the thing')).toBeInTheDocument();
    expect(screen.getByText('acme/repo')).toBeInTheDocument();
    expect(screen.getByText('octocat')).toBeInTheDocument();
  });

  it('renders the "Link Pull Request" button', async () => {
    await importAndRender([]);
    expect(screen.getByText('Link Pull Request')).toBeInTheDocument();
  });

  it('shows inline form when "Link Pull Request" is clicked', async () => {
    await importAndRender();
    fireEvent.click(screen.getByText('Link Pull Request'));
    expect(
      screen.getByPlaceholderText('https://github.com/owner/repo/pull/123'),
    ).toBeInTheDocument();
    expect(screen.getByText('Link')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls linkPullRequest on form submit', async () => {
    const onMutate = vi.fn();
    await importAndRender([MOCK_PR], 'task-1', onMutate);

    fireEvent.click(screen.getByText('Link Pull Request'));
    const input = screen.getByPlaceholderText('https://github.com/owner/repo/pull/123');
    fireEvent.change(input, {
      target: { value: 'https://github.com/test/repo/pull/99' },
    });
    fireEvent.click(screen.getByText('Link'));

    await waitFor(() => {
      expect(mockLinkPullRequest).toHaveBeenCalledWith({
        taskId: 'task-1',
        url: 'https://github.com/test/repo/pull/99',
      });
    });
    await waitFor(() => {
      expect(onMutate).toHaveBeenCalled();
    });
  });

  it('submits on Enter key', async () => {
    await importAndRender();

    fireEvent.click(screen.getByText('Link Pull Request'));
    const input = screen.getByPlaceholderText('https://github.com/owner/repo/pull/123');
    fireEvent.change(input, {
      target: { value: 'https://github.com/test/repo/pull/1' },
    });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockLinkPullRequest).toHaveBeenCalledWith({
        taskId: 'task-1',
        url: 'https://github.com/test/repo/pull/1',
      });
    });
  });

  it('hides form on Cancel click', async () => {
    await importAndRender();

    fireEvent.click(screen.getByText('Link Pull Request'));
    expect(
      screen.getByPlaceholderText('https://github.com/owner/repo/pull/123'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(
      screen.queryByPlaceholderText('https://github.com/owner/repo/pull/123'),
    ).not.toBeInTheDocument();
  });

  it('hides form on Escape key', async () => {
    await importAndRender();

    fireEvent.click(screen.getByText('Link Pull Request'));
    const input = screen.getByPlaceholderText('https://github.com/owner/repo/pull/123');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(
      screen.queryByPlaceholderText('https://github.com/owner/repo/pull/123'),
    ).not.toBeInTheDocument();
  });

  it('displays error when link mutation fails', async () => {
    mockLinkPullRequest.mockResolvedValueOnce({
      error: {
        graphQLErrors: [{ message: 'Invalid GitHub PR URL' }],
        message: 'Invalid GitHub PR URL',
      },
    });

    await importAndRender();
    fireEvent.click(screen.getByText('Link Pull Request'));
    const input = screen.getByPlaceholderText('https://github.com/owner/repo/pull/123');
    fireEvent.change(input, { target: { value: 'https://bad-url' } });
    fireEvent.click(screen.getByText('Link'));

    await waitFor(() => {
      expect(screen.getByText('Invalid GitHub PR URL')).toBeInTheDocument();
    });
  });

  it('does not submit when URL is empty', async () => {
    await importAndRender();

    fireEvent.click(screen.getByText('Link Pull Request'));
    fireEvent.click(screen.getByText('Link'));

    expect(mockLinkPullRequest).not.toHaveBeenCalled();
  });

  it('calls unlinkPullRequest when unlink button is clicked', async () => {
    const onMutate = vi.fn();
    await importAndRender([MOCK_PR], 'task-1', onMutate);

    const unlinkButton = screen.getByTitle('Unlink pull request');
    fireEvent.click(unlinkButton);

    await waitFor(() => {
      expect(mockUnlinkPullRequest).toHaveBeenCalledWith('pr-1');
    });
    await waitFor(() => {
      expect(onMutate).toHaveBeenCalled();
    });
  });

  it('displays error when unlink mutation fails', async () => {
    mockUnlinkPullRequest.mockResolvedValueOnce({
      error: {
        graphQLErrors: [{ message: 'Pull request not found' }],
        message: 'Pull request not found',
      },
    });

    await importAndRender([MOCK_PR]);
    const unlinkButton = screen.getByTitle('Unlink pull request');
    fireEvent.click(unlinkButton);

    await waitFor(() => {
      expect(screen.getByText('Pull request not found')).toBeInTheDocument();
    });
  });

  it('clears error when typing in the URL input', async () => {
    mockLinkPullRequest.mockResolvedValueOnce({
      error: {
        graphQLErrors: [{ message: 'Some error' }],
        message: 'Some error',
      },
    });

    await importAndRender();
    fireEvent.click(screen.getByText('Link Pull Request'));
    const input = screen.getByPlaceholderText('https://github.com/owner/repo/pull/123');
    fireEvent.change(input, { target: { value: 'bad' } });
    fireEvent.click(screen.getByText('Link'));

    await waitFor(() => {
      expect(screen.getByText('Some error')).toBeInTheDocument();
    });

    fireEvent.change(input, { target: { value: 'new-value' } });
    expect(screen.queryByText('Some error')).not.toBeInTheDocument();
  });
});
