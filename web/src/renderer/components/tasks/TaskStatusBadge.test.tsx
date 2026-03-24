// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TaskStatusBadge } from './TaskStatusBadge.js';
import { TaskStatus } from '../../graphql/__generated__/generated.js';

afterEach(cleanup);

describe('TaskStatusBadge', () => {
  it('renders "Todo" with gray styling', () => {
    render(<TaskStatusBadge status={TaskStatus.Todo} />);
    const badge = screen.getByTestId('task-status-badge');
    expect(badge).toHaveTextContent('Todo');
    expect(badge.className).toContain('bg-surface-hover');
    expect(badge.className).toContain('text-fg-muted');
  });

  it('renders "In Progress" with blue styling', () => {
    render(<TaskStatusBadge status={TaskStatus.InProgress} />);
    const badge = screen.getByTestId('task-status-badge');
    expect(badge).toHaveTextContent('In Progress');
    expect(badge.className).toContain('bg-info-muted');
    expect(badge.className).toContain('text-info');
  });

  it('renders "In Review" with yellow styling', () => {
    render(<TaskStatusBadge status={TaskStatus.InReview} />);
    const badge = screen.getByTestId('task-status-badge');
    expect(badge).toHaveTextContent('In Review');
    expect(badge.className).toContain('bg-warning-muted');
    expect(badge.className).toContain('text-warning');
  });

  it('renders "Done" with green styling', () => {
    render(<TaskStatusBadge status={TaskStatus.Done} />);
    const badge = screen.getByTestId('task-status-badge');
    expect(badge).toHaveTextContent('Done');
    expect(badge.className).toContain('bg-success-muted');
    expect(badge.className).toContain('text-success');
  });

  it('renders "Cancelled" with red styling', () => {
    render(<TaskStatusBadge status={TaskStatus.Cancelled} />);
    const badge = screen.getByTestId('task-status-badge');
    expect(badge).toHaveTextContent('Cancelled');
    expect(badge.className).toContain('bg-error-muted');
    expect(badge.className).toContain('text-error');
  });
});
