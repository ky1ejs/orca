import { useState, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, X, CaseSensitive } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import type { SearchAddon } from '@xterm/addon-search';

interface TerminalSearchBarProps {
  searchAddon: SearchAddon;
  onClose: () => void;
}

export function TerminalSearchBar({ searchAddon, onClose }: TerminalSearchBarProps) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const caseSensitiveRef = useRef(caseSensitive);
  caseSensitiveRef.current = caseSensitive;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const findNext = () => {
    if (query) searchAddon.findNext(query, { caseSensitive, incremental: false });
  };

  const findPrevious = () => {
    if (query) searchAddon.findPrevious(query, { caseSensitive });
  };

  useEffect(() => {
    if (query) {
      searchAddon.findNext(query, { caseSensitive: caseSensitiveRef.current, incremental: true });
    } else {
      searchAddon.clearDecorations();
    }
  }, [searchAddon, query]);

  const handleCaseToggle = () => {
    const next = !caseSensitive;
    setCaseSensitive(next);
    if (query) searchAddon.findNext(query, { caseSensitive: next, incremental: true });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      findPrevious();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      findNext();
    }
  };

  return (
    <div
      data-testid="terminal-search-bar"
      className="absolute top-1 right-4 z-10 flex items-center gap-1 rounded border border-edge bg-surface-overlay px-2 py-1 shadow-md"
    >
      <input
        ref={inputRef}
        data-testid="terminal-search-input"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find"
        className="w-40 bg-transparent text-fg text-body-sm outline-none placeholder:text-fg-muted"
      />
      <button
        data-testid="terminal-search-case-toggle"
        onClick={handleCaseToggle}
        className={`rounded p-0.5 transition-colors ${caseSensitive ? 'bg-accent text-on-accent' : 'text-fg-muted hover:text-fg'}`}
        title="Match Case"
      >
        <CaseSensitive className={iconSize.sm} />
      </button>
      <button
        data-testid="terminal-search-prev"
        onClick={findPrevious}
        className="rounded p-0.5 text-fg-muted transition-colors hover:text-fg"
        title="Previous Match"
      >
        <ChevronUp className={iconSize.sm} />
      </button>
      <button
        data-testid="terminal-search-next"
        onClick={findNext}
        className="rounded p-0.5 text-fg-muted transition-colors hover:text-fg"
        title="Next Match"
      >
        <ChevronDown className={iconSize.sm} />
      </button>
      <button
        data-testid="terminal-search-close"
        onClick={onClose}
        className="rounded p-0.5 text-fg-muted transition-colors hover:text-fg"
        title="Close"
      >
        <X className={iconSize.sm} />
      </button>
    </div>
  );
}
