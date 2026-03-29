import type { Root, Text, Link, PhrasingContent } from 'mdast';
import type { VisitorResult } from 'unist-util-visit';
import { visit } from 'unist-util-visit';
import { TASK_ID_PATTERN } from './taskIdPattern.js';

/**
 * Remark plugin that transforms task ID references (e.g. ORCA-123) into
 * link nodes with a `task://` scheme URL, which can be intercepted by
 * react-markdown's component overrides.
 */
export function remarkTaskIds() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent): VisitorResult => {
      if (!parent || index === undefined) return;

      // Don't linkify inside code blocks or inline code
      if (parent.type === 'code' || parent.type === 'inlineCode') return;
      // Don't linkify text that's already inside a link
      if (parent.type === 'link') return;

      const matches = [...node.value.matchAll(TASK_ID_PATTERN)];
      if (matches.length === 0) return;

      const children: PhrasingContent[] = [];
      let lastIndex = 0;

      for (const match of matches) {
        const matchStart = match.index;

        if (matchStart > lastIndex) {
          children.push({ type: 'text', value: node.value.slice(lastIndex, matchStart) });
        }

        const linkNode: Link = {
          type: 'link',
          url: `task://${match[1]}`,
          children: [{ type: 'text', value: match[1] }],
        };
        children.push(linkNode);

        lastIndex = matchStart + match[0].length;
      }

      if (lastIndex < node.value.length) {
        children.push({ type: 'text', value: node.value.slice(lastIndex) });
      }

      parent.children.splice(index, 1, ...children);
      return index + children.length;
    });
  };
}
