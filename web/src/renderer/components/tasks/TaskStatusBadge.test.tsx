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
    expect(badge.className).toContain('bg-gray-700');
    expect(badge.className).toContain('text-gray-300');
  });

  it('renders "In Progress" with blue styling', () => {
    render(<TaskStatusBadge status={TaskStatus.InProgress} />);
    const badge = screen.getByTestId('task-status-badge');
    expect(badge).toHaveTextContent('In Progress');
    expect(badge.className).toContain('bg-blue-900');
    expect(badge.className).toContain('text-blue-300');
  });

  it('renders "In Review" with yellow styling', () => {
    render(<TaskStatusBadge status={TaskStatus.InReview} />);
    const badge = screen.getByTestId('task-status-badge');
    expect(badge).toHaveTextContent('In Review');
    expect(badge.className).toContain('bg-yellow-900');
    expect(badge.className).toContain('text-yellow-300');
  });

  it('renders "Done" with green styling', () => {
    render(<TaskStatusBadge status={TaskStatus.Done} />);
    const badge = screen.getByTestId('task-status-badge');
    expect(badge).toHaveTextContent('Done');
    expect(badge.className).toContain('bg-green-900');
    expect(badge.className).toContain('text-green-300');
  });
});
