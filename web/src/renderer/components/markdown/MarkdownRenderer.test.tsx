// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../shared/TaskIdLink.js', () => ({
  TaskIdLink: ({ displayId }: { displayId: string }) => (
    <button data-testid={`task-link-${displayId}`}>{displayId}</button>
  ),
}));

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

  describe('task ID linkification', () => {
    it('renders a task ID as a clickable TaskIdLink', () => {
      render(<MarkdownRenderer content="See ORCA-123 for details" />);
      expect(screen.getByTestId('task-link-ORCA-123')).toBeInTheDocument();
      expect(screen.getByText('ORCA-123')).toBeInTheDocument();
    });

    it('renders multiple task IDs', () => {
      render(<MarkdownRenderer content="ORCA-1 and PROJ-42" />);
      expect(screen.getByTestId('task-link-ORCA-1')).toBeInTheDocument();
      expect(screen.getByTestId('task-link-PROJ-42')).toBeInTheDocument();
    });

    it('does not linkify task IDs inside inline code', () => {
      render(<MarkdownRenderer content="Run `ORCA-123` command" />);
      const code = screen.getByText('ORCA-123');
      expect(code.tagName).toBe('CODE');
      expect(screen.queryByTestId('task-link-ORCA-123')).not.toBeInTheDocument();
    });

    it('does not linkify task IDs inside code blocks', () => {
      render(<MarkdownRenderer content={'```\nORCA-123\n```'} />);
      expect(screen.queryByTestId('task-link-ORCA-123')).not.toBeInTheDocument();
    });

    it('preserves surrounding text when linkifying', () => {
      render(<MarkdownRenderer content="Before ORCA-1 after" />);
      expect(screen.getByText(/Before/)).toBeInTheDocument();
      expect(screen.getByText(/after/)).toBeInTheDocument();
      expect(screen.getByTestId('task-link-ORCA-1')).toBeInTheDocument();
    });
  });

  it('renders images by default', () => {
    render(<MarkdownRenderer content="![diagram](https://example.com/a.png)" />);
    expect(screen.getByRole('img', { name: 'diagram' })).toBeInTheDocument();
  });

  it('shows only the alt text of images in untrusted text', () => {
    render(<MarkdownRenderer content="![tracking pixel](https://example.com/a.png)" isUntrusted />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('blocked-image')).toHaveTextContent('[image: tracking pixel]');
  });

  it('shows the real address of web links in untrusted text', () => {
    render(<MarkdownRenderer content="[Your bank](https://evil.example/login)" isUntrusted />);
    expect(screen.getByRole('link', { name: 'Your bank' })).toHaveAttribute(
      'href',
      'https://evil.example/login',
    );
    expect(screen.getByTestId('untrusted-link-url')).toHaveTextContent(
      '(https://evil.example/login)',
    );
  });

  it.each([
    ['a relative path', '[Logs](../../x.command)'],
    ['a file URL', '[Logs](file:///Applications/Calculator.app)'],
    ['another orca URL', '[Connect](orca://github/callback?installation_id=1&workspaceId=w)'],
  ])('turns %s into plain text in untrusted text', (_name, content) => {
    render(<MarkdownRenderer content={content} isUntrusted />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByTestId('untrusted-link-text')).toHaveTextContent(/Logs|Connect/);
  });

  it('never links to orca URLs other than tasks, even in trusted text', () => {
    render(<MarkdownRenderer content="[Connect](orca://github/callback?installation_id=1)" />);
    expect(screen.getByText('Connect').closest('a')?.getAttribute('href') ?? '').not.toContain(
      'orca://github',
    );
  });
});
