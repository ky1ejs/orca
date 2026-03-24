// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { StatusIcon } from './StatusIcon.js';
import { TaskStatus } from '../../graphql/__generated__/generated.js';

describe('StatusIcon', () => {
  it('renders a TODO icon with aria-label', () => {
    const { container } = render(<StatusIcon status={TaskStatus.Todo} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('aria-label')).toBe('Status: Todo');
  });

  it('renders an IN_PROGRESS icon with aria-label', () => {
    const { container } = render(<StatusIcon status={TaskStatus.InProgress} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Status: In Progress');
  });

  it('renders an IN_REVIEW icon with aria-label', () => {
    const { container } = render(<StatusIcon status={TaskStatus.InReview} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Status: In Review');
  });

  it('renders a DONE icon with aria-label and checkmark', () => {
    const { container } = render(<StatusIcon status={TaskStatus.Done} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Status: Done');
    // Done icon has a path for the checkmark
    const path = svg?.querySelector('path');
    expect(path).toBeTruthy();
  });

  it('renders a CANCELLED icon with aria-label', () => {
    const { container } = render(<StatusIcon status={TaskStatus.Cancelled} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Status: Cancelled');
  });

  it('applies custom className', () => {
    const { container } = render(<StatusIcon status={TaskStatus.Todo} className="w-6 h-6" />);
    const svg = container.querySelector('svg');
    expect(svg?.className.baseVal).toContain('w-6');
  });
});
