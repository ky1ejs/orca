// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LabelBadge } from './LabelBadge.js';

afterEach(cleanup);

describe('LabelBadge', () => {
  it('renders name and color', () => {
    render(<LabelBadge name="Bug" color="#FF0000" />);
    const badge = screen.getByTestId('label-badge');
    expect(badge).toHaveTextContent('Bug');
    expect(badge).toHaveStyle({ color: '#FF0000' });
  });

  it('calls onRemove when X is clicked', () => {
    const onRemove = vi.fn();
    render(<LabelBadge name="Bug" color="#FF0000" onRemove={onRemove} />);
    fireEvent.click(screen.getByTestId('label-remove'));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('does not show X when onRemove is not provided', () => {
    render(<LabelBadge name="Bug" color="#FF0000" />);
    expect(screen.queryByTestId('label-remove')).not.toBeInTheDocument();
  });
});
