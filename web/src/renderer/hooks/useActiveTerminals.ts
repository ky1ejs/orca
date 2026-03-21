import { useMemo } from 'react';
import { useTerminalSessions, type TerminalSessionInfo } from './useTerminalSessions.js';
import { SessionStatus, isActiveSessionStatus } from '../../shared/session-status.js';
import { PullRequestStatus, type CheckStatus } from '../graphql/__generated__/generated.js';

interface PrimaryPullRequest {
  number: number;
  status: PullRequestStatus;
  draft: boolean;
  checkStatus: CheckStatus | null;
}

export interface ActiveTerminalEntry {
  taskId: string;
  displayId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  sessionCount: number;
  sessionIds: string[];
  status: string;
  pullRequest?: PrimaryPullRequest;
}

interface PullRequestRef {
  id: string;
  number: number;
  status: PullRequestStatus;
  draft: boolean;
  checkStatus: CheckStatus | null;
  createdAt: string;
}

interface TaskRef {
  id: string;
  displayId: string;
  title: string;
  pullRequests?: PullRequestRef[];
}

interface ProjectData {
  id: string;
  name: string;
  tasks: TaskRef[];
}

/** Pick the most relevant PR to display: prefer open > merged > closed, most recent first. */
export function pickPrimaryPr(
  pullRequests: PullRequestRef[] | undefined,
): PrimaryPullRequest | undefined {
  if (!pullRequests || pullRequests.length === 0) return undefined;

  let bestOpen: PullRequestRef | undefined;
  let bestMerged: PullRequestRef | undefined;
  let bestOther: PullRequestRef | undefined;

  for (const pr of pullRequests) {
    if (pr.status === PullRequestStatus.Open) {
      if (!bestOpen || pr.createdAt > bestOpen.createdAt) bestOpen = pr;
    } else if (pr.status === PullRequestStatus.Merged) {
      if (!bestMerged || pr.createdAt > bestMerged.createdAt) bestMerged = pr;
    } else {
      if (!bestOther || pr.createdAt > bestOther.createdAt) bestOther = pr;
    }
  }

  const pick = bestOpen ?? bestMerged ?? bestOther!;
  return {
    number: pick.number,
    status: pick.status,
    draft: pick.draft,
    checkStatus: pick.checkStatus,
  };
}

export function useActiveTerminals(
  projects: ProjectData[],
  inboxTasks: TaskRef[] = [],
): ActiveTerminalEntry[] {
  const { sessions } = useTerminalSessions();

  return useMemo(() => {
    const activeSessions = sessions.filter(
      (s) => s.task_id !== null && isActiveSessionStatus(s.status),
    );

    // Build a lookup map from task_id -> task info
    const taskLookup = new Map<
      string,
      {
        displayId: string;
        title: string;
        projectId: string;
        projectName: string;
        pullRequests?: PullRequestRef[];
      }
    >();
    for (const project of projects) {
      for (const task of project.tasks) {
        taskLookup.set(task.id, {
          displayId: task.displayId,
          title: task.title,
          projectId: project.id,
          projectName: project.name,
          pullRequests: task.pullRequests,
        });
      }
    }
    for (const task of inboxTasks) {
      if (!taskLookup.has(task.id)) {
        taskLookup.set(task.id, {
          displayId: task.displayId,
          title: task.title,
          projectId: '',
          projectName: 'Inbox',
          pullRequests: task.pullRequests,
        });
      }
    }

    // Group sessions by task_id
    const grouped = new Map<string, TerminalSessionInfo[]>();
    for (const session of activeSessions) {
      const taskId = session.task_id!;
      if (!taskLookup.has(taskId)) continue;
      const existing = grouped.get(taskId);
      if (existing) {
        existing.push(session);
      } else {
        grouped.set(taskId, [session]);
      }
    }

    // Build entries
    const entries: ActiveTerminalEntry[] = [];
    for (const [taskId, taskSessions] of grouped) {
      const info = taskLookup.get(taskId)!;
      // Use the "most active" status for the dot
      const status = pickMostActiveStatus(taskSessions);
      entries.push({
        taskId,
        displayId: info.displayId,
        taskTitle: info.title,
        projectId: info.projectId,
        projectName: info.projectName,
        sessionCount: taskSessions.length,
        sessionIds: taskSessions.map((s) => s.id),
        status,
        pullRequest: pickPrimaryPr(info.pullRequests),
      });
    }

    return entries;
  }, [sessions, projects, inboxTasks]);
}

/** Pick the most prominent status to display for a group of sessions. */
function pickMostActiveStatus(sessions: TerminalSessionInfo[]): string {
  // Priority: AWAITING_PERMISSION > WAITING_FOR_INPUT > RUNNING > STARTING
  const statuses = new Set(sessions.map((s) => s.status));
  if (statuses.has(SessionStatus.AwaitingPermission)) return SessionStatus.AwaitingPermission;
  if (statuses.has(SessionStatus.WaitingForInput)) return SessionStatus.WaitingForInput;
  if (statuses.has(SessionStatus.Running)) return SessionStatus.Running;
  if (statuses.has(SessionStatus.Starting)) return SessionStatus.Starting;
  return sessions[0].status;
}
