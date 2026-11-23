import type { ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkTaskIds } from '../../utils/remarkTaskIds.js';
import { TaskIdLink } from '../shared/TaskIdLink.js';

interface MarkdownRendererProps {
  content: string;
  /**
   * True for text from outside the team, such as an external task's
   * description. Images render as their alt text, and only http(s) and
   * mailto links stay clickable, with their real address shown.
   */
  isUntrusted?: boolean;
}

const TASK_PATH_PREFIX = 'orca://task/';
const UNTRUSTED_LINK_SCHEMES = ['http:', 'https:', 'mailto:'];
const remarkPlugins = [remarkGfm, remarkTaskIds];

// Only task links use the app's own scheme. Other orca:// URLs (such as the
// GitHub callback) are handled by the app and must not be reachable from text.
function urlTransform(url: string): string {
  if (url.startsWith(TASK_PATH_PREFIX)) return url;
  return defaultUrlTransform(url);
}

interface LinkProps {
  href?: string;
  node?: unknown;
  children?: ReactNode;
  [key: string]: unknown;
}

const components = {
  a: ({ href, node: _node, ...props }: LinkProps) => {
    if (href?.startsWith(TASK_PATH_PREFIX)) {
      const displayId = href.slice(TASK_PATH_PREFIX.length);
      return <TaskIdLink displayId={displayId} />;
    }
    return <a href={href} {...props} />;
  },
};

function hasScheme(href: string, schemes: string[]): boolean {
  try {
    return schemes.includes(new URL(href).protocol);
  } catch {
    // Relative or malformed: no scheme.
    return false;
  }
}

const untrustedComponents = {
  a: ({ href, node: _node, children, ...props }: LinkProps) => {
    if (href?.startsWith(TASK_PATH_PREFIX)) {
      return <TaskIdLink displayId={href.slice(TASK_PATH_PREFIX.length)} />;
    }
    if (!href || !hasScheme(href, UNTRUSTED_LINK_SCHEMES)) {
      return <span data-testid="untrusted-link-text">{children}</span>;
    }
    return (
      <>
        <a href={href} title={href} {...props}>
          {children}
        </a>{' '}
        <span className="font-mono text-code-sm text-fg-faint" data-testid="untrusted-link-url">
          ({href})
        </span>
      </>
    );
  },
  img: ({ alt }: { alt?: string }) => (
    <span className="text-fg-muted" data-testid="blocked-image">
      [image{alt ? `: ${alt}` : ''}]
    </span>
  ),
};

export function MarkdownRenderer({ content, isUntrusted = false }: MarkdownRendererProps) {
  return (
    <div
      className="prose prose-sm max-w-none prose-code:font-mono prose-code:text-code-sm"
      data-testid="markdown-renderer"
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={isUntrusted ? untrustedComponents : components}
        urlTransform={urlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
