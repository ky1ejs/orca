// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PriorityIcon } from './PriorityIcon.js';
import { TaskPriority } from '../../graphql/__generated__/generated.js';

describe('PriorityIcon', () => {
  it('renders nothing visible for NONE priority', () => {
    const { container } = render(<PriorityIcon priority={TaskPriority.None} />);
    const span = container.querySelector('span');
    expect(span).toBeTruthy();
    expect(span?.getAttribute('aria-label')).toBe('No priority');
  });

  it('renders an SVG for LOW priority with correct aria-label', () => {
    const { container } = render(<PriorityIcon priority={TaskPriority.Low} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('aria-label')).toBe('Priority: Low');
  });

  it('renders an SVG for MEDIUM priority', () => {
    const { container } = render(<PriorityIcon priority={TaskPriority.Medium} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Priority: Medium');
  });

  it('renders an SVG for HIGH priority', () => {
    const { container } = render(<PriorityIcon priority={TaskPriority.High} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Priority: High');
  });

  it('renders an SVG for URGENT priority with priority-urgent color', () => {
    const { container } = render(<PriorityIcon priority={TaskPriority.Urgent} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Priority: Urgent');
    expect(svg?.className.baseVal).toContain('text-priority-urgent');
  });

  it('renders 4 bars for all priorities (some dimmed)', () => {
    const { container } = render(<PriorityIcon priority={TaskPriority.Low} />);
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(4);
  });
});
