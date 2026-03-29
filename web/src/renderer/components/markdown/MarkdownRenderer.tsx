import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkTaskIds } from '../../utils/remarkTaskIds.js';
import { TaskIdLink } from '../shared/TaskIdLink.js';

interface MarkdownRendererProps {
  content: string;
}

const TASK_LINK_PREFIX = 'task://';
const remarkPlugins = [remarkGfm, remarkTaskIds];

const components = {
  a: ({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) => {
    if (href?.startsWith(TASK_LINK_PREFIX)) {
      const displayId = href.slice(TASK_LINK_PREFIX.length);
      return <TaskIdLink displayId={displayId} />;
    }
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div
      className="prose prose-sm max-w-none prose-code:font-mono prose-code:text-code-sm"
      data-testid="markdown-renderer"
    >
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
