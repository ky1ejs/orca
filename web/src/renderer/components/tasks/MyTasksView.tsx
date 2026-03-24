import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronRight, ClipboardList } from 'lucide-react';
import { iconSize, iconStroke } from '../../tokens/icon-size.js';
import { TaskStatus } from '../../graphql/__generated__/generated.js';
import { StatusIcon } from '../shared/StatusIcon.js';
import { PriorityIcon } from '../shared/PriorityIcon.js';
import { PullRequestIndicator } from './PullRequestIndicator.js';
import { EmptyState } from '../layout/EmptyState.js';
import { useMyTasks, type MyTask } from '../../hooks/useMyTasks.js';
import { useNavigation } from '../../navigation/context.js';
import {
  STATUS_ORDER,
  STATUS_LABELS,
  DEFAULT_COLLAPSED_STATUSES,
  groupTasksByStatus,
} from '../../utils/task-status.js';

export function MyTasksView() {
  const { tasks, count } = useMyTasks();
  const { navigate } = useNavigation();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(DEFAULT_COLLAPSED_STATUSES);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const tableRef = useRef<HTMLDivElement>(null);

  const grouped = useMemo(() => groupTasksByStatus(tasks), [tasks]);

  const visibleTasks = useMemo(() => {
    const result: MyTask[] = [];
    for (const status of STATUS_ORDER) {
      if (!collapsed[status]) {
        result.push(...grouped[status]);
      }
    }
    return result;
  }, [grouped, collapsed]);

  const toggleCollapse = (status: TaskStatus) => {
    setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  const handleTaskClick = useCallback(
    (task: MyTask) => {
      navigate({
        view: 'task',
        id: task.id,
        projectId: task.projectId,
        projectName: task.projectName,
        taskName: task.title,
        fromView: 'my-tasks',
      });
    },
    [navigate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (visibleTasks.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
        case 'j': {
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, visibleTasks.length - 1));
          break;
        }
        case 'ArrowUp':
        case 'k': {
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        }
        case 'Enter': {
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < visibleTasks.length) {
            handleTaskClick(visibleTasks[focusedIndex]);
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          setFocusedIndex(-1);
          tableRef.current?.blur();
          break;
        }
      }
    },
    [visibleTasks, focusedIndex, handleTaskClick],
  );

  const handleTableFocus = () => {
    if (focusedIndex === -1 && visibleTasks.length > 0) {
      setFocusedIndex(0);
    }
  };

  if (count === 0) {
    return (
      <div className="px-6">
        <h1 className="text-heading-lg font-semibold text-fg mb-6">My Tasks</h1>
        <EmptyState
          icon={<ClipboardList className={iconSize.lg} strokeWidth={iconStroke.lg} />}
          title="No tasks assigned to you"
          description="Tasks assigned to you will appear here."
        />
      </div>
    );
  }

  return (
    <div className="px-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-heading-lg font-semibold text-fg">My Tasks</h1>
        <span className="text-label-sm text-fg-faint bg-surface-inset rounded-full px-2 py-0.5">
          {count}
        </span>
      </div>
      <div
        ref={tableRef}
        role="grid"
        aria-label="My Tasks"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={handleTableFocus}
        className="outline-none"
      >
        {STATUS_ORDER.map((status) => {
          const groupTasks = grouped[status];
          const isCollapsed = !!collapsed[status];

          return (
            <MyTasksGroup
              key={status}
              status={status}
              tasks={groupTasks}
              isCollapsed={isCollapsed}
              onToggleCollapse={() => toggleCollapse(status)}
              onTaskClick={handleTaskClick}
              focusedTaskId={
                focusedIndex >= 0 && focusedIndex < visibleTasks.length
                  ? visibleTasks[focusedIndex].id
                  : null
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function MyTasksGroup({
  status,
  tasks,
  isCollapsed,
  onToggleCollapse,
  onTaskClick,
  focusedTaskId,
}: {
  status: TaskStatus;
  tasks: MyTask[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onTaskClick: (task: MyTask) => void;
  focusedTaskId: string | null;
}) {
  return (
    <div>
      <div
        role="row"
        aria-expanded={!isCollapsed}
        className="group flex items-center h-9 px-3 bg-surface-raised/50 cursor-pointer select-none"
        onClick={onToggleCollapse}
      >
        <ChevronRight
          className={`${iconSize.xs} text-fg-faint mr-2 transition-transform duration-150 ${
            isCollapsed ? '' : 'rotate-90'
          }`}
        />
        <StatusIcon status={status} className={`${iconSize.sm} mr-2`} />
        <span className="text-fg-muted text-body-sm font-medium">{STATUS_LABELS[status]}</span>
        <span className="text-fg-faint text-code-sm font-mono ml-2">{tasks.length}</span>
      </div>
      <div
        className="grid transition-[grid-template-rows] duration-150 ease-in-out"
        style={{ gridTemplateRows: isCollapsed ? '0fr' : '1fr' }}
      >
        <div className="overflow-hidden">
          {tasks.map((task) => (
            <MyTaskRow
              key={task.id}
              task={task}
              isFocused={task.id === focusedTaskId}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MyTaskRow({
  task,
  isFocused,
  onClick,
}: {
  task: MyTask;
  isFocused: boolean;
  onClick: () => void;
}) {
  return (
    <div
      role="row"
      aria-selected={isFocused}
      className={`flex items-center h-10 px-3 gap-2 cursor-pointer transition-colors duration-75 ${
        isFocused
          ? 'bg-surface-overlay/30 border-l-2 border-fg'
          : 'border-l-2 border-transparent hover:bg-surface-overlay/50'
      }`}
      onClick={onClick}
    >
      <div role="gridcell" className="w-4 flex-shrink-0">
        <PriorityIcon priority={task.priority} className={iconSize.sm} />
      </div>
      <div role="gridcell" className="w-4 flex-shrink-0">
        <StatusIcon status={task.status} className={iconSize.sm} />
      </div>
      <div role="gridcell" className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="text-fg-faint text-code-sm font-mono mr-1 flex-shrink-0">
          {task.displayId}
        </span>
        <span className="text-fg text-body-sm truncate">{task.title}</span>
        {task.labels?.map((label) => (
          <span
            key={label.id}
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: label.color }}
            title={label.name}
          />
        ))}
      </div>
      {task.projectName && (
        <div role="gridcell" className="flex-shrink-0">
          <span className="text-fg-faint text-label-xs bg-surface-inset rounded px-1.5 py-0.5">
            {task.projectName}
          </span>
        </div>
      )}
      {task.pullRequestCount != null && task.pullRequestCount > 0 && (
        <div role="gridcell" className="flex-shrink-0">
          <PullRequestIndicator count={task.pullRequestCount} />
        </div>
      )}
    </div>
  );
}
