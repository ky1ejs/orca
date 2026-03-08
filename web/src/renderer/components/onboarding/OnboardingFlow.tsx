import { useState, useCallback } from 'react';
import { useCreateProject, useCreateTask } from '../../hooks/useGraphQL.js';
import { useNavigation } from '../../navigation/context.js';
import { useWorkspace } from '../../workspace/context.js';

type OnboardingStep = 'welcome' | 'create-project' | 'create-task' | 'open-terminal';

interface OnboardingFlowProps {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [defaultDirectory, setDefaultDirectory] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { createProject } = useCreateProject();
  const { createTask } = useCreateTask();
  const { navigate } = useNavigation();
  const { currentWorkspace } = useWorkspace();

  const handleCreateProject = useCallback(async () => {
    if (!projectName.trim() || !currentWorkspace) return;
    setCreating(true);
    const result = await createProject({
      name: projectName.trim(),
      description: projectDescription.trim() || undefined,
      defaultDirectory: defaultDirectory.trim() || undefined,
      workspaceId: currentWorkspace.id,
    });
    if (result.data?.createProject) {
      setCreatedProjectId(result.data.createProject.id);
      setStep('create-task');
    }
    setCreating(false);
  }, [projectName, projectDescription, defaultDirectory, createProject, currentWorkspace]);

  const handleCreateTask = useCallback(async () => {
    if (!taskTitle.trim() || !createdProjectId) return;
    setCreating(true);
    const result = await createTask({
      title: taskTitle.trim(),
      projectId: createdProjectId,
    });
    if (result.data?.createTask) {
      setCreatedTaskId(result.data.createTask.id);
      setStep('open-terminal');
    }
    setCreating(false);
  }, [taskTitle, createdProjectId, createTask]);

  const handleFinish = useCallback(() => {
    if (createdTaskId) {
      navigate({ view: 'task', id: createdTaskId });
    } else if (createdProjectId) {
      navigate({ view: 'project', id: createdProjectId });
    }
    onComplete();
  }, [createdTaskId, createdProjectId, navigate, onComplete]);

  const stepIndicator = (
    <div className="flex items-center gap-2 mb-8" data-testid="onboarding-steps">
      {(['welcome', 'create-project', 'create-task', 'open-terminal'] as const).map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full transition-colors ${
              s === step
                ? 'bg-blue-500'
                : ['welcome', 'create-project', 'create-task', 'open-terminal'].indexOf(step) > i
                  ? 'bg-blue-400/50'
                  : 'bg-gray-700'
            }`}
          />
          {i < 3 && <div className="h-px w-8 bg-gray-700" />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-full items-center justify-center p-8" data-testid="onboarding-flow">
      <div className="w-full max-w-lg">
        {stepIndicator}

        {step === 'welcome' && (
          <div data-testid="onboarding-welcome">
            <h1 className="text-3xl font-bold text-white mb-3">Welcome to Orca</h1>
            <p className="text-gray-400 mb-2">
              Orca helps you orchestrate AI agents for your coding projects.
            </p>
            <p className="text-gray-500 text-sm mb-8">
              Let&apos;s set up your first project and task. This only takes a minute.
            </p>
            <button
              onClick={() => setStep('create-project')}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium"
              data-testid="onboarding-get-started"
            >
              Get Started
            </button>
          </div>
        )}

        {step === 'create-project' && (
          <div data-testid="onboarding-create-project">
            <h2 className="text-2xl font-bold text-white mb-2">Create a Project</h2>
            <p className="text-gray-400 text-sm mb-6">
              A project groups related tasks together. Name it after the repo or codebase you are
              working on.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g., My App"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
                  autoFocus
                  data-testid="onboarding-project-name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="Brief description of the project"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 resize-none"
                  rows={2}
                  data-testid="onboarding-project-description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Default Directory
                </label>
                <input
                  type="text"
                  value={defaultDirectory}
                  onChange={(e) => setDefaultDirectory(e.target.value)}
                  placeholder="e.g., /Users/you/projects/my-app"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 font-mono"
                  data-testid="onboarding-default-dir"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('welcome')}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-md transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleCreateProject}
                  disabled={!projectName.trim() || creating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-md transition-colors font-medium"
                  data-testid="onboarding-create-project-btn"
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'create-task' && (
          <div data-testid="onboarding-create-task">
            <h2 className="text-2xl font-bold text-white mb-2">Create a Task</h2>
            <p className="text-gray-400 text-sm mb-6">
              A task is a unit of work for an AI agent. Give it a descriptive title.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Task Title</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g., Add user authentication"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
                  autoFocus
                  data-testid="onboarding-task-title"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('create-project')}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-md transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleCreateTask}
                  disabled={!taskTitle.trim() || creating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-md transition-colors font-medium"
                  data-testid="onboarding-create-task-btn"
                >
                  {creating ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'open-terminal' && (
          <div data-testid="onboarding-open-terminal">
            <h2 className="text-2xl font-bold text-white mb-2">You are all set!</h2>
            <p className="text-gray-400 text-sm mb-3">
              Your project and task are ready. Head to the task view to open a terminal.
            </p>
            <p className="text-gray-500 text-xs mb-8">
              Tip: Use{' '}
              <kbd className="px-1 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-300">
                {'\u2318'}Enter
              </kbd>{' '}
              to quickly open or restart a terminal. Press{' '}
              <kbd className="px-1 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-300">
                {'\u2318'}/
              </kbd>{' '}
              to see all keyboard shortcuts.
            </p>
            <button
              onClick={handleFinish}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium"
              data-testid="onboarding-finish"
            >
              Go to Task
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
