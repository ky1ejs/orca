import { useEffect, useRef, useState } from 'react';
import { useClient } from 'urql';
import { TaskByDisplayIdDocument } from '../../graphql/__generated__/generated.js';
import { useNavigation } from '../../navigation/context.js';
import { useWorkspace } from '../../workspace/context.js';

interface TaskIdLinkProps {
  displayId: string;
  className?: string;
}

export function TaskIdLink({ displayId, className }: TaskIdLinkProps) {
  const client = useClient();
  const { navigate } = useNavigation();
  const { currentWorkspace } = useWorkspace();
  const [resolving, setResolving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const notFoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (notFoundTimerRef.current) clearTimeout(notFoundTimerRef.current);
    };
  }, []);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!currentWorkspace) return;

    setResolving(true);
    setNotFound(false);

    const result = await client
      .query(TaskByDisplayIdDocument, {
        displayId: displayId.toUpperCase(),
        workspaceId: currentWorkspace.id,
      })
      .toPromise();

    if (result.error) {
      setResolving(false);
      setNotFound(true);
      notFoundTimerRef.current = setTimeout(() => setNotFound(false), 2000);
      return;
    }

    const task = result.data?.taskByDisplayId;
    if (task) {
      setResolving(false);
      navigate({
        view: 'task',
        id: task.id,
        projectId: task.projectId ?? undefined,
        projectName: task.project?.name,
      });
    } else {
      setResolving(false);
      setNotFound(true);
      notFoundTimerRef.current = setTimeout(() => setNotFound(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${
        className ??
        'text-accent hover:text-accent-hover hover:underline font-medium transition-colors'
      } ${resolving ? 'cursor-wait' : ''} ${notFound ? 'text-error' : ''}`.trim()}
      title={notFound ? `Task ${displayId} not found` : `Go to ${displayId}`}
    >
      {displayId}
    </button>
  );
}
