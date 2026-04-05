import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { iconSize } from '../../tokens/icon-size.js';
import { SessionStatus, isActiveSessionStatus } from '../../../shared/session-status.js';
import { useSetTaskHeaderControls } from './TaskHeaderContext.js';
import {
  useTask,
  useUpdateTask,
  useArchiveTask,
  useWorkspaceMembers,
} from '../../hooks/useGraphQL.js';
import { useNavigation } from '../../navigation/context.js';
import { useWorkspace } from '../../workspace/context.js';
import { useWorkspaceData } from '../../workspace/workspace-data-context.js';
import { useProjectDirectory } from '../../hooks/useProjectDirectory.js';
import type { TerminalSessionInfo } from '../../hooks/useTerminalSessions.js';
import { TaskStatus } from '../../graphql/__generated__/generated.js';
import type { TaskQuery, WorkspaceMembersQuery } from '../../graphql/__generated__/generated.js';
import { isTerminalStatus } from '../../utils/task-status.js';
import { TaskDetailSkeleton } from '../layout/Skeleton.js';
import { PullRequestList } from './PullRequestList.js';
import { TaskRelationshipList } from './TaskRelationshipList.js';
import { TaskActivityFeed } from '../activity/TaskActivityFeed.js';
import { TaskDetailHeader } from './TaskDetailHeader.js';
import { TaskDetailDescription } from './TaskDetailDescription.js';
import { TaskDetailSidebar } from './TaskDetailSidebar.js';

type TaskPullRequests = NonNullable<TaskQuery['task']>['pullRequests'];
type TaskRelationships = NonNullable<TaskQuery['task']>['relationships'];
type WorkspaceMembers = NonNullable<WorkspaceMembersQuery['workspace']>['members'];

const EMPTY_PULL_REQUESTS: TaskPullRequests = [];
const EMPTY_RELATIONSHIPS: TaskRelationships = [];
const EMPTY_MEMBERS: WorkspaceMembers = [];

interface TaskDetailProps {
  taskId: string;
  sessions: TerminalSessionInfo[];
  refreshSessions: () => void;
}

export function TaskDetail({ taskId, sessions, refreshSessions }: TaskDetailProps) {
  const { data, fetching, error, refetch } = useTask(taskId);
  const { updateTask } = useUpdateTask();
  const { archiveTask } = useArchiveTask();
  const { goToParent } = useNavigation();
  const { currentWorkspace } = useWorkspace();
  const [agentError, setAgentError] = useState<{
    message: string;
    suggestion: string;
  } | null>(null);
  const {
    directory: projectDirectory,
    loading: dirLoading,
    updateDirectory,
  } = useProjectDirectory(data?.task?.projectId);

  const { projects: workspaceProjects } = useWorkspaceData();
  const { data: membersData } = useWorkspaceMembers(currentWorkspace?.slug ?? '');
  const rawMembers = membersData?.workspace?.members;
  const workspaceMembers = useMemo(() => rawMembers ?? EMPTY_MEMBERS, [rawMembers]);

  const task = data?.task;
  const activeSession = useMemo(
    () => sessions.find((s) => isActiveSessionStatus(s.status)),
    [sessions],
  );
  const errorSession = useMemo(
    () => sessions.find((s) => s.status === SessionStatus.Error),
    [sessions],
  );

  const buildMetadata = useCallback(
    () => ({
      displayId: task?.displayId ?? '',
      title: task?.title ?? '',
      description: task?.description ?? null,
      projectName: task?.project?.name ?? null,
      workspaceSlug: currentWorkspace?.slug ?? '',
    }),
    [task?.displayId, task?.title, task?.description, task?.project?.name, currentWorkspace?.slug],
  );

  const setHeaderControls = useSetTaskHeaderControls();

  const refreshSessionsRef = useRef(refreshSessions);
  useEffect(() => {
    refreshSessionsRef.current = refreshSessions;
  }, [refreshSessions]);

  const handleStatusChange = useCallback(
    async (newStatus: TaskStatus) => {
      if (isTerminalStatus(newStatus) && activeSession) {
        await window.orca.agent.stop(activeSession.id);
        refreshSessionsRef.current();
      }
      await updateTask(taskId, { status: newStatus });
    },
    [activeSession, updateTask, taskId],
  );

  const handleArchive = useCallback(async () => {
    await archiveTask(taskId);
    goToParent();
  }, [archiveTask, taskId, goToParent]);

  const handleMutate = useCallback(() => refetch({ requestPolicy: 'network-only' }), [refetch]);

  const pullRequests = task?.pullRequests ?? EMPTY_PULL_REQUESTS;
  const relationships = task?.relationships ?? EMPTY_RELATIONSHIPS;
  const currentWorkspaceId = currentWorkspace?.id ?? '';

  useEffect(() => {
    if (!task) {
      setHeaderControls(null);
      return;
    }
    const next = {
      displayId: task.displayId,
      taskId,
      activeSession,
      errorSession,
      projectDirectory: projectDirectory ?? null,
      refreshSessions,
      buildMetadata,
      onAgentError: setAgentError,
    };
    setHeaderControls((prev) => {
      if (
        prev &&
        prev.displayId === next.displayId &&
        prev.taskId === next.taskId &&
        prev.activeSession === next.activeSession &&
        prev.errorSession === next.errorSession &&
        prev.projectDirectory === next.projectDirectory
      ) {
        return prev;
      }
      return next;
    });
    return () => setHeaderControls(null);
  }, [
    task,
    taskId,
    activeSession,
    errorSession,
    projectDirectory,
    refreshSessions,
    buildMetadata,
    setHeaderControls,
  ]);

  if (fetching && !data) {
    return <TaskDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6 text-error">
        <p>Error loading task: {error.message}</p>
      </div>
    );
  }

  if (!task) {
    if (fetching) {
      return <TaskDetailSkeleton />;
    }
    return (
      <div className="p-6 text-fg-muted">
        <p>Task not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 grid grid-cols-[1fr_320px] gap-8 items-start">
      <div className="min-w-0 space-y-6">
        <TaskDetailHeader
          displayId={task.displayId}
          title={task.title}
          taskId={taskId}
          updateTask={updateTask}
        />

        <TaskDetailDescription
          description={task.description ?? null}
          taskId={taskId}
          updateTask={updateTask}
        />

        {agentError && (
          <div
            className="p-3 bg-error-muted border border-error-strong rounded-md"
            data-testid="agent-error"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-error text-body-sm">{agentError.message}</p>
                <p className="text-error/70 text-label-sm mt-1">{agentError.suggestion}</p>
              </div>
              <button
                onClick={() => setAgentError(null)}
                className="text-error hover:text-error text-label-md ml-2"
                data-testid="dismiss-error"
              >
                <X className={iconSize.sm} />
              </button>
            </div>
          </div>
        )}

        <PullRequestList pullRequests={pullRequests} taskId={taskId} onMutate={handleMutate} />

        <TaskRelationshipList
          relationships={relationships}
          taskId={taskId}
          workspaceId={currentWorkspaceId}
          onMutate={handleMutate}
        />

        <TaskActivityFeed taskId={taskId} />
      </div>

      <div className="sticky top-6 self-start">
        <TaskDetailSidebar
          task={task}
          updateTask={updateTask}
          handleStatusChange={handleStatusChange}
          handleArchive={handleArchive}
          workspaceProjects={workspaceProjects}
          workspaceMembers={workspaceMembers}
          currentWorkspaceId={currentWorkspaceId}
          projectDirectory={projectDirectory ?? null}
          dirLoading={dirLoading}
          updateDirectory={updateDirectory}
        />
      </div>
    </div>
  );
}
