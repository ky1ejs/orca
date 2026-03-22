// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TerminalSearchBar } from './TerminalSearchBar.js';
import type { SearchAddon } from '@xterm/addon-search';

function createMockSearchAddon(): SearchAddon {
  return {
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    clearDecorations: vi.fn(),
    dispose: vi.fn(),
    activate: vi.fn(),
  } as unknown as SearchAddon;
}

describe('TerminalSearchBar', () => {
  let addon: SearchAddon;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    addon = createMockSearchAddon();
    onClose = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders search input and buttons', () => {
    const { getByTestId } = render(<TerminalSearchBar searchAddon={addon} onClose={onClose} />);
    expect(getByTestId('terminal-search-input')).toBeInTheDocument();
    expect(getByTestId('terminal-search-prev')).toBeInTheDocument();
    expect(getByTestId('terminal-search-next')).toBeInTheDocument();
    expect(getByTestId('terminal-search-close')).toBeInTheDocument();
    expect(getByTestId('terminal-search-case-toggle')).toBeInTheDocument();
  });

  it('focuses input on mount', () => {
    const { getByTestId } = render(<TerminalSearchBar searchAddon={addon} onClose={onClose} />);
    expect(getByTestId('terminal-search-input')).toHaveFocus();
  });

  it('performs incremental search on input change', () => {
    const { getByTestId } = render(<TerminalSearchBar searchAddon={addon} onClose={onClose} />);
    fireEvent.change(getByTestId('terminal-search-input'), { target: { value: 'hello' } });
    expect(addon.findNext).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({
        incremental: true,
      }),
    );
  });

  it('clears decorations when input is emptied', () => {
    const { getByTestId } = render(<TerminalSearchBar searchAddon={addon} onClose={onClose} />);
    fireEvent.change(getByTestId('terminal-search-input'), { target: { value: 'hello' } });
    fireEvent.change(getByTestId('terminal-search-input'), { target: { value: '' } });
    expect(addon.clearDecorations).toHaveBeenCalled();
  });

  it('calls findNext on Enter', () => {
    const { getByTestId } = render(<TerminalSearchBar searchAddon={addon} onClose={onClose} />);
    fireEvent.change(getByTestId('terminal-search-input'), { target: { value: 'test' } });
    vi.mocked(addon.findNext).mockClear();
    fireEvent.keyDown(getByTestId('terminal-search-input'), { key: 'Enter' });
    expect(addon.findNext).toHaveBeenCalledWith('test', {
      caseSensitive: false,
      incremental: false,
    });
  });

  it('calls findPrevious on Shift+Enter', () => {
    const { getByTestId } = render(<TerminalSearchBar searchAddon={addon} onClose={onClose} />);
    fireEvent.change(getByTestId('terminal-search-input'), { target: { value: 'test' } });
    fireEvent.keyDown(getByTestId('terminal-search-input'), { key: 'Enter', shiftKey: true });
    expect(addon.findPrevious).toHaveBeenCalledWith('test', { caseSensitive: false });
  });

  it('calls onClose on Escape', () => {
    const { getByTestId } = render(<TerminalSearchBar searchAddon={addon} onClose={onClose} />);
    fireEvent.keyDown(getByTestId('terminal-search-input'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls findNext on next button click', () => {
    const { getByTestId } = render(<TerminalSearchBar searchAddon={addon} onClose={onClose} />);
    fireEvent.change(getByTestId('terminal-search-input'), { target: { value: 'test' } });
    vi.mocked(addon.findNext).mockClear();
    fireEvent.click(getByTestId('terminal-search-next'));
    expect(addon.findNext).toHaveBeenCalledWith('test', {
      caseSensitive: false,
      incremental: false,
    });
  });

  it('calls findPrevious on prev button click', () => {
    const { getByTestId } = render(<TerminalSearchBar searchAddon={addon} onClose={onClose} />);
    fireEvent.change(getByTestId('terminal-search-input'), { target: { value: 'test' } });
    fireEvent.click(getByTestId('terminal-search-prev'));
    expect(addon.findPrevious).toHaveBeenCalledWith('test', { caseSensitive: false });
  });

  it('calls onClose on close button click', () => {
    const { getByTestId } = render(<TerminalSearchBar searchAddon={addon} onClose={onClose} />);
    fireEvent.click(getByTestId('terminal-search-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('toggles case sensitivity and re-searches', () => {
    const { getByTestId } = render(<TerminalSearchBar searchAddon={addon} onClose={onClose} />);
    fireEvent.change(getByTestId('terminal-search-input'), { target: { value: 'test' } });
    vi.mocked(addon.findNext).mockClear();

    // Toggle case sensitive on — should immediately re-search
    fireEvent.click(getByTestId('terminal-search-case-toggle'));

    expect(addon.findNext).toHaveBeenCalledWith('test', {
      caseSensitive: true,
      incremental: true,
    });
  });
});
