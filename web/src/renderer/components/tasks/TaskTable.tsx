import { useCallback, useMemo, useRef, useState } from 'react';
import { TaskStatus, TaskPriority } from '../../graphql/__generated__/generated.js';
import { StatusIcon } from '../shared/StatusIcon.js';
import { PriorityIcon } from '../shared/PriorityIcon.js';
import { formatRelativeDate } from '../../utils/formatRelativeDate.js';
import { TaskTableInlineCreate } from './TaskTableInlineCreate.js';
import { EmptyTaskList } from '../layout/EmptyState.js';

interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
}

interface TaskTableProps {
  projectId: string;
  tasks: TaskSummary[];
  onTaskClick: (taskId: string) => void;
}

const STATUS_ORDER: TaskStatus[] = [
  TaskStatus.InProgress,
  TaskStatus.InReview,
  TaskStatus.Todo,
  TaskStatus.Done,
];

const STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.InProgress]: 'In Progress',
  [TaskStatus.InReview]: 'In Review',
  [TaskStatus.Todo]: 'Todo',
  [TaskStatus.Done]: 'Done',
};

function groupTasksByStatus(tasks: TaskSummary[]): Record<TaskStatus, TaskSummary[]> {
  const groups: Record<TaskStatus, TaskSummary[]> = {
    [TaskStatus.InProgress]: [],
    [TaskStatus.InReview]: [],
    [TaskStatus.Todo]: [],
    [TaskStatus.Done]: [],
  };
  for (const task of tasks) {
    groups[task.status].push(task);
  }
  return groups;
}

export function TaskTable({ projectId, tasks, onTaskClick }: TaskTableProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    [TaskStatus.Done]: true,
  });
  const [inlineCreateStatus, setInlineCreateStatus] = useState<TaskStatus | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const tableRef = useRef<HTMLDivElement>(null);

  const grouped = groupTasksByStatus(tasks);

  // Build a flat list of visible task IDs for keyboard navigation
  const visibleTasks = useMemo(() => {
    const result: TaskSummary[] = [];
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Don't intercept keys when typing in an input/textarea/contenteditable
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
            onTaskClick(visibleTasks[focusedIndex].id);
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
    [visibleTasks, focusedIndex, onTaskClick],
  );

  const handleTableFocus = () => {
    if (focusedIndex === -1 && visibleTasks.length > 0) {
      setFocusedIndex(0);
    }
  };

  // Get the most recent working directory from existing tasks for inline create
  const mostRecentWorkingDir =
    tasks.length > 0
      ? [...tasks].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0]?.id
        ? // We don't have workingDirectory in TaskSummary, so pass empty
          ''
        : ''
      : '';

  if (tasks.length === 0 && !inlineCreateStatus) {
    return <EmptyTaskList onCreateTask={() => setInlineCreateStatus(TaskStatus.Todo)} />;
  }

  return (
    <div
      ref={tableRef}
      role="grid"
      aria-label="Tasks"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={handleTableFocus}
      className="outline-none"
    >
      {STATUS_ORDER.map((status) => {
        const groupTasks = grouped[status];
        const isCollapsed = !!collapsed[status];

        return (
          <TaskTableGroup
            key={status}
            status={status}
            tasks={groupTasks}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleCollapse(status)}
            onTaskClick={onTaskClick}
            onAddTask={() => setInlineCreateStatus(status)}
            focusedTaskId={
              focusedIndex >= 0 && focusedIndex < visibleTasks.length
                ? visibleTasks[focusedIndex].id
                : null
            }
            inlineCreate={
              inlineCreateStatus === status ? (
                <TaskTableInlineCreate
                  projectId={projectId}
                  status={status}
                  defaultWorkingDirectory={mostRecentWorkingDir}
                  onClose={() => setInlineCreateStatus(null)}
                />
              ) : null
            }
          />
        );
      })}
    </div>
  );
}

// --- Unexported sub-components ---

interface TaskTableGroupProps {
  status: TaskStatus;
  tasks: TaskSummary[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onTaskClick: (taskId: string) => void;
  onAddTask: () => void;
  focusedTaskId: string | null;
  inlineCreate: React.ReactNode;
}

function TaskTableGroup({
  status,
  tasks,
  isCollapsed,
  onToggleCollapse,
  onTaskClick,
  onAddTask,
  focusedTaskId,
  inlineCreate,
}: TaskTableGroupProps) {
  return (
    <div>
      {/* Group Header */}
      <div
        role="row"
        aria-expanded={!isCollapsed}
        className="group flex items-center h-9 px-3 bg-gray-900/50 cursor-pointer select-none"
        onClick={onToggleCollapse}
      >
        <svg
          className={`w-3 h-3 text-gray-500 mr-2 transition-transform duration-150 ${
            isCollapsed ? '' : 'rotate-90'
          }`}
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path d="M4 2l5 4-5 4V2z" />
        </svg>
        <StatusIcon status={status} className="w-4 h-4 mr-2" />
        <span className="text-gray-300 text-sm font-medium">{STATUS_LABELS[status]}</span>
        <span className="text-gray-500 text-xs ml-2">{tasks.length}</span>
        <div className="flex-1" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddTask();
          }}
          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-300 text-sm transition-opacity"
          aria-label={`Add task to ${STATUS_LABELS[status]}`}
        >
          +
        </button>
      </div>

      {/* Collapsible content using grid-template-rows */}
      <div
        className="grid transition-[grid-template-rows] duration-150 ease-in-out"
        style={{ gridTemplateRows: isCollapsed ? '0fr' : '1fr' }}
      >
        <div className="overflow-hidden">
          {inlineCreate}
          {tasks.map((task) => (
            <TaskTableRow
              key={task.id}
              task={task}
              isFocused={task.id === focusedTaskId}
              onClick={() => onTaskClick(task.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface TaskTableRowProps {
  task: TaskSummary;
  isFocused: boolean;
  onClick: () => void;
}

function TaskTableRow({ task, isFocused, onClick }: TaskTableRowProps) {
  return (
    <div
      role="row"
      aria-selected={isFocused}
      className={`flex items-center h-10 px-3 gap-2 cursor-pointer transition-colors duration-75 ${
        isFocused
          ? 'bg-gray-800/30 border-l-2 border-blue-500'
          : 'border-l-2 border-transparent hover:bg-gray-800/50'
      }`}
      onClick={onClick}
    >
      <div role="gridcell" className="w-4 flex-shrink-0">
        <PriorityIcon priority={task.priority} className="w-4 h-4" />
      </div>
      <div role="gridcell" className="w-4 flex-shrink-0">
        <StatusIcon status={task.status} className="w-4 h-4" />
      </div>
      <div role="gridcell" className="flex-1 min-w-0">
        <span className="text-gray-100 text-sm truncate block">{task.title}</span>
      </div>
      <div role="gridcell" className="flex-shrink-0">
        <span className="text-gray-500 text-xs">{formatRelativeDate(task.updatedAt)}</span>
      </div>
    </div>
  );
}
