import { describe, expect, it } from 'vitest';
import { remarkTaskIds } from './remarkTaskIds.js';
import type { Root, Text, Link, Paragraph, InlineCode } from 'mdast';

function makeTree(children: Root['children']): Root {
  return { type: 'root', children };
}

function paragraph(...children: Paragraph['children']): Paragraph {
  return { type: 'paragraph', children };
}

function text(value: string): Text {
  return { type: 'text', value };
}

function link(url: string, children: Link['children']): Link {
  return { type: 'link', url, children };
}

function inlineCode(value: string): InlineCode {
  return { type: 'inlineCode', value };
}

function transform(tree: Root): Root {
  remarkTaskIds()(tree);
  return tree;
}

describe('remarkTaskIds', () => {
  it('linkifies a task ID in plain text', () => {
    const tree = transform(makeTree([paragraph(text('See ORCA-123 for details'))]));
    const p = tree.children[0] as Paragraph;
    expect(p.children).toHaveLength(3);
    expect(p.children[0]).toEqual({ type: 'text', value: 'See ' });
    expect(p.children[1]).toMatchObject({
      type: 'link',
      url: 'orca://task/ORCA-123',
      children: [{ type: 'text', value: 'ORCA-123' }],
    });
    expect(p.children[2]).toEqual({ type: 'text', value: ' for details' });
  });

  it('linkifies multiple task IDs', () => {
    const tree = transform(makeTree([paragraph(text('ORCA-1 and PROJ-42'))]));
    const p = tree.children[0] as Paragraph;
    expect(p.children).toHaveLength(3);
    expect(p.children[0]).toMatchObject({ type: 'link', url: 'orca://task/ORCA-1' });
    expect(p.children[1]).toEqual({ type: 'text', value: ' and ' });
    expect(p.children[2]).toMatchObject({ type: 'link', url: 'orca://task/PROJ-42' });
  });

  it('does not linkify text inside an existing link', () => {
    const tree = transform(makeTree([paragraph(link('https://example.com', [text('ORCA-99')]))]));
    const p = tree.children[0] as Paragraph;
    expect(p.children).toHaveLength(1);
    expect((p.children[0] as Link).url).toBe('https://example.com');
    expect(((p.children[0] as Link).children[0] as Text).value).toBe('ORCA-99');
  });

  it('does not linkify text inside inline code', () => {
    const tree = transform(makeTree([paragraph(inlineCode('ORCA-100'))]));
    const p = tree.children[0] as Paragraph;
    expect(p.children).toHaveLength(1);
    expect(p.children[0]).toEqual({ type: 'inlineCode', value: 'ORCA-100' });
  });

  it('does not modify text without task IDs', () => {
    const tree = transform(makeTree([paragraph(text('No task IDs here'))]));
    const p = tree.children[0] as Paragraph;
    expect(p.children).toHaveLength(1);
    expect((p.children[0] as Text).value).toBe('No task IDs here');
  });

  it('handles task ID at start of text', () => {
    const tree = transform(makeTree([paragraph(text('ORCA-1 is important'))]));
    const p = tree.children[0] as Paragraph;
    expect(p.children).toHaveLength(2);
    expect(p.children[0]).toMatchObject({ type: 'link', url: 'orca://task/ORCA-1' });
    expect(p.children[1]).toEqual({ type: 'text', value: ' is important' });
  });

  it('handles task ID at end of text', () => {
    const tree = transform(makeTree([paragraph(text('See ORCA-1'))]));
    const p = tree.children[0] as Paragraph;
    expect(p.children).toHaveLength(2);
    expect(p.children[0]).toEqual({ type: 'text', value: 'See ' });
    expect(p.children[1]).toMatchObject({ type: 'link', url: 'orca://task/ORCA-1' });
  });
});
