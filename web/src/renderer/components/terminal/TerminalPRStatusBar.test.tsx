// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PullRequestStatus } from '../../graphql/__generated__/generated.js';

const mockRefetch = vi.fn();

let mockPullRequests: {
  id: string;
  number: number;
  title: string;
  url: string;
  status: PullRequestStatus;
  reviewStatus: string | null;
  checkStatus: string | null;
  repository: string;
  headBranch: string;
  author: string;
  draft: boolean;
  createdAt: string;
}[] = [];

vi.mock('../../hooks/useGraphQL.js', () => ({
  useTask: () => ({
    data: { task: { pullRequests: mockPullRequests } },
    fetching: false,
    refetch: mockRefetch,
  }),
  useLinkPullRequest: () => ({
    linkPullRequest: vi.fn().mockResolvedValue({ data: {} }),
    fetching: false,
  }),
}));

vi.mock('../tasks/PullRequestBadge.js', () => ({
  PullRequestBadge: ({ status }: { status: string }) => (
    <span data-testid="pr-badge">{status}</span>
  ),
}));

vi.mock('../tasks/CIStatusBadge.js', () => ({
  CIStatusBadge: () => null,
}));

vi.mock('../tasks/PullRequestIcon.js', () => ({
  PullRequestIcon: () => <span data-testid="pr-icon" />,
}));

vi.mock('../tasks/ReviewIndicator.js', () => ({
  ReviewIndicator: () => null,
}));

beforeEach(() => {
  mockPullRequests = [];
  vi.clearAllMocks();
});

afterEach(cleanup);

async function importAndRender(taskId = 'task-1') {
  const { TerminalPRStatusBar } = await import('./TerminalPRStatusBar.js');
  return render(<TerminalPRStatusBar taskId={taskId} />);
}

describe('TerminalPRStatusBar', () => {
  it('shows "No pull requests" when task has none', async () => {
    await importAndRender();

    expect(screen.getByText('No pull requests')).toBeInTheDocument();
  });

  it('renders pull requests from useTask data', async () => {
    mockPullRequests = [
      {
        id: 'pr-1',
        number: 42,
        title: 'Fix login bug',
        url: 'https://github.com/org/repo/pull/42',
        status: PullRequestStatus.Open,
        reviewStatus: null,
        checkStatus: null,
        repository: 'org/repo',
        headBranch: 'fix-login',
        author: 'dev',
        draft: false,
        createdAt: '2024-01-01',
      },
    ];

    await importAndRender();

    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    expect(screen.queryByText('No pull requests')).not.toBeInTheDocument();
  });

  it('renders multiple pull requests', async () => {
    mockPullRequests = [
      {
        id: 'pr-1',
        number: 42,
        title: 'First PR',
        url: 'https://github.com/org/repo/pull/42',
        status: PullRequestStatus.Open,
        reviewStatus: null,
        checkStatus: null,
        repository: 'org/repo',
        headBranch: 'feat-1',
        author: 'dev',
        draft: false,
        createdAt: '2024-01-01',
      },
      {
        id: 'pr-2',
        number: 43,
        title: 'Second PR',
        url: 'https://github.com/org/repo/pull/43',
        status: PullRequestStatus.Merged,
        reviewStatus: null,
        checkStatus: null,
        repository: 'org/repo',
        headBranch: 'feat-2',
        author: 'dev',
        draft: false,
        createdAt: '2024-01-02',
      },
    ];

    await importAndRender();

    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText('#43')).toBeInTheDocument();
    expect(screen.getByText('First PR')).toBeInTheDocument();
    expect(screen.getByText('Second PR')).toBeInTheDocument();
  });

  it('shows Link PR button', async () => {
    await importAndRender();

    expect(screen.getByText('Link PR')).toBeInTheDocument();
  });

  it('shows link form when Link PR is clicked', async () => {
    await importAndRender();

    fireEvent.click(screen.getByText('Link PR'));

    expect(
      screen.getByPlaceholderText('https://github.com/owner/repo/pull/123'),
    ).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });
});
