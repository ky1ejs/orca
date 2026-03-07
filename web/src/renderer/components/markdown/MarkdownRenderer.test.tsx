// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MarkdownRenderer } from './MarkdownRenderer.js';

afterEach(cleanup);

describe('MarkdownRenderer', () => {
  it('renders plain text', () => {
    render(<MarkdownRenderer content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders bold text', () => {
    render(<MarkdownRenderer content="**bold text**" />);
    const strong = screen.getByText('bold text');
    expect(strong.tagName).toBe('STRONG');
  });

  it('renders headings', () => {
    render(<MarkdownRenderer content="# Heading 1" />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Heading 1');
  });

  it('renders links', () => {
    render(<MarkdownRenderer content="[click here](https://example.com)" />);
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('click here');
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  it('renders GFM tables', () => {
    const tableMarkdown = `| Col A | Col B |
| --- | --- |
| Cell 1 | Cell 2 |`;
    render(<MarkdownRenderer content={tableMarkdown} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Cell 1')).toBeInTheDocument();
    expect(screen.getByText('Cell 2')).toBeInTheDocument();
  });

  it('renders GFM strikethrough', () => {
    render(<MarkdownRenderer content="~~deleted~~" />);
    const del = screen.getByText('deleted');
    expect(del.tagName).toBe('DEL');
  });

  it('has markdown-renderer test id', () => {
    render(<MarkdownRenderer content="test" />);
    expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
  });
});
