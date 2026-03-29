import type { ReactNode } from 'react';
import { TaskIdLink } from '../components/shared/TaskIdLink.js';
import { TASK_ID_PATTERN } from './taskIdPattern.js';

export function linkifyTaskIds(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TASK_ID_PATTERN)) {
    const matchStart = match.index;
    if (matchStart > lastIndex) {
      parts.push(text.slice(lastIndex, matchStart));
    }
    parts.push(<TaskIdLink key={matchStart} displayId={match[1]} />);
    lastIndex = matchStart + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
