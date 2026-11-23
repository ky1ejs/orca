import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkTaskIds } from '../../utils/remarkTaskIds.js';
import { TaskIdLink } from '../shared/TaskIdLink.js';

interface MarkdownRendererProps {
  content: string;
  /**
   * False for text from outside the team: images render as their alt text,
   * so the text can't load or show an image the reader didn't choose.
   */
  allowImages?: boolean;
}

const ORCA_SCHEME = 'orca://';
const TASK_PATH_PREFIX = `${ORCA_SCHEME}task/`;
const remarkPlugins = [remarkGfm, remarkTaskIds];

function urlTransform(url: string): string {
  if (url.startsWith(ORCA_SCHEME)) return url;
  return defaultUrlTransform(url);
}

const components = {
  a: ({
    href,
    node: _node,
    ...props
  }: {
    href?: string;
    node?: unknown;
    [key: string]: unknown;
  }) => {
    if (href?.startsWith(TASK_PATH_PREFIX)) {
      const displayId = href.slice(TASK_PATH_PREFIX.length);
      return <TaskIdLink displayId={displayId} />;
    }
    return <a href={href} {...props} />;
  },
};

const componentsWithoutImages = {
  ...components,
  img: ({ alt }: { alt?: string }) => (
    <span className="text-fg-muted" data-testid="blocked-image">
      [image{alt ? `: ${alt}` : ''}]
    </span>
  ),
};

export function MarkdownRenderer({ content, allowImages = true }: MarkdownRendererProps) {
  return (
    <div
      className="prose prose-sm max-w-none prose-code:font-mono prose-code:text-code-sm"
      data-testid="markdown-renderer"
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={allowImages ? components : componentsWithoutImages}
        urlTransform={urlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
