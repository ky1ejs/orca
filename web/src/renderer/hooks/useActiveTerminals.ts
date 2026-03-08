import { useMemo } from 'react';
import { useTerminalSessions, type TerminalSessionInfo } from './useTerminalSessions.js';
import { isActiveSessionStatus } from '../../shared/session-status.js';

export interface ActiveTerminalEntry {
  taskId: string;
  displayId: string;
  taskTitle: string;
  projectName: string;
  sessionCount: number;
  status: string;
}

interface ProjectData {
  id: string;
  name: string;
  tasks: Array<{ id: string; displayId: string; title: string }>;
}

export function useActiveTerminals(projects: ProjectData[]): ActiveTerminalEntry[] {
  const { sessions } = useTerminalSessions();

  return useMemo(() => {
    const activeSessions = sessions.filter(
      (s) => s.task_id !== null && isActiveSessionStatus(s.status),
    );

    // Build a lookup map from task_id -> task info
    const taskLookup = new Map<string, { displayId: string; title: string; projectName: string }>();
    for (const project of projects) {
      for (const task of project.tasks) {
        taskLookup.set(task.id, {
          displayId: task.displayId,
          title: task.title,
          projectName: project.name,
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
        projectName: info.projectName,
        sessionCount: taskSessions.length,
        status,
      });
    }

    return entries;
  }, [sessions, projects]);
}

/** Pick the most prominent status to display for a group of sessions. */
function pickMostActiveStatus(sessions: TerminalSessionInfo[]): string {
  // Priority: WAITING_FOR_INPUT > RUNNING > STARTING
  const statuses = new Set(sessions.map((s) => s.status));
  if (statuses.has('WAITING_FOR_INPUT')) return 'WAITING_FOR_INPUT';
  if (statuses.has('RUNNING')) return 'RUNNING';
  if (statuses.has('STARTING')) return 'STARTING';
  return sessions[0].status;
}
