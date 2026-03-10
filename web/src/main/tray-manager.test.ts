import { describe, expect, it, afterEach, vi, beforeEach } from 'vitest';
import { SessionStatus } from '../shared/session-status.js';

// ─── Electron mocks ────────────────────────────────────────────────────────────

const mockTrayInstance = {
  setTitle: vi.fn(),
  setToolTip: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn(),
};

const mockTrayConstructor = vi.fn<(icon: unknown) => typeof mockTrayInstance>(
  () => mockTrayInstance,
);

const mockShow = vi.fn();
const mockFocus = vi.fn();

vi.mock('electron', () => ({
  Tray: class {
    constructor(icon: unknown) {
      mockTrayConstructor(icon);
      return mockTrayInstance;
    }
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [{ show: mockShow, focus: mockFocus }]),
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({
      setTemplateImage: vi.fn(),
    })),
  },
}));

import { TrayManager } from './tray-manager.js';

// ─── Helpers ────────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 100;
const IDLE_TIMEOUT_MS = 20_000;

function flushDebounce() {
  vi.advanceTimersByTime(DEBOUNCE_MS + 1);
}

function flushIdle() {
  vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 1);
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('TrayManager', () => {
  let manager: TrayManager;
  const createWindowFn = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    manager = new TrayManager('/fake/icon.png', createWindowFn);
  });

  afterEach(() => {
    manager.clear();
    vi.useRealTimers();
  });

  // ─── Tray lifecycle ─────────────────────────────────────────────────────────

  it('creates tray when first active session is added', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    flushDebounce();

    expect(mockTrayConstructor).toHaveBeenCalledTimes(1);
  });

  it('does not create tray for non-active statuses', () => {
    manager.handleStatusChange('s1', SessionStatus.Exited);
    flushDebounce();

    expect(mockTrayConstructor).not.toHaveBeenCalled();
  });

  it('destroys tray when last active session is removed', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    flushDebounce();

    manager.handleStatusChange('s1', SessionStatus.Exited);
    flushDebounce();

    expect(mockTrayInstance.destroy).toHaveBeenCalled();
  });

  it('does not destroy tray when other active sessions remain', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    manager.handleStatusChange('s2', SessionStatus.Running);
    flushDebounce();

    manager.handleStatusChange('s1', SessionStatus.Exited);
    flushDebounce();

    expect(mockTrayInstance.destroy).not.toHaveBeenCalled();
  });

  // ─── Count computation ──────────────────────────────────────────────────────

  it('correctly counts in-progress sessions', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    manager.handleStatusChange('s2', SessionStatus.Starting);
    flushDebounce();

    expect(mockTrayInstance.setTitle).toHaveBeenCalledWith(' 2▶ 0⏸ 0⚠');
  });

  it('correctly counts idle sessions', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    flushDebounce();

    // Trigger activity stop → idle timer
    manager.handleActivityChange('s1', false);
    flushIdle();
    flushDebounce();

    expect(mockTrayInstance.setTitle).toHaveBeenLastCalledWith(' 0▶ 1⏸ 0⚠');
  });

  it('correctly counts needs-attention sessions', () => {
    manager.handleStatusChange('s1', SessionStatus.WaitingForInput);
    manager.handleStatusChange('s2', SessionStatus.AwaitingPermission);
    flushDebounce();

    expect(mockTrayInstance.setTitle).toHaveBeenCalledWith(' 0▶ 0⏸ 2⚠');
  });

  it('removes Error sessions from tracking (not an active status)', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    flushDebounce();

    // Error is not an active status, so session gets removed from tracking
    manager.handleStatusChange('s1', SessionStatus.Error);
    flushDebounce();

    // Session removed — tray destroyed since no active sessions remain
    expect(mockTrayInstance.destroy).toHaveBeenCalled();
  });

  it('counts mixed statuses correctly', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    manager.handleStatusChange('s2', SessionStatus.Running);
    manager.handleStatusChange('s3', SessionStatus.WaitingForInput);
    flushDebounce();

    // Make s2 idle
    manager.handleActivityChange('s2', false);
    flushIdle();
    flushDebounce();

    expect(mockTrayInstance.setTitle).toHaveBeenLastCalledWith(' 1▶ 1⏸ 1⚠');
  });

  // ─── Title format ───────────────────────────────────────────────────────────

  it('formats title correctly', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    flushDebounce();

    expect(mockTrayInstance.setTitle).toHaveBeenCalledWith(' 1▶ 0⏸ 0⚠');
  });

  // ─── Tooltip ────────────────────────────────────────────────────────────────

  it('sets tooltip with human-readable labels', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    manager.handleStatusChange('s2', SessionStatus.WaitingForInput);
    flushDebounce();

    expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith(
      '1 working, 0 idle, 1 needs attention',
    );
  });

  // ─── Activity/Idle tracking ─────────────────────────────────────────────────

  it('starts idle timer when activity stops', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    flushDebounce();

    manager.handleActivityChange('s1', false);

    // Before idle timeout, session is still in-progress
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1000);
    flushDebounce();
    expect(mockTrayInstance.setTitle).toHaveBeenLastCalledWith(' 1▶ 0⏸ 0⚠');

    // After idle timeout, session becomes idle
    vi.advanceTimersByTime(1001);
    flushDebounce();
    expect(mockTrayInstance.setTitle).toHaveBeenLastCalledWith(' 0▶ 1⏸ 0⚠');
  });

  it('cancels idle timer when activity resumes', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    flushDebounce();

    // Start idle timer
    manager.handleActivityChange('s1', false);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1000);

    // Activity resumes before idle fires
    manager.handleActivityChange('s1', true);
    vi.advanceTimersByTime(2000);
    flushDebounce();

    // Should still be in-progress, not idle
    expect(mockTrayInstance.setTitle).toHaveBeenLastCalledWith(' 1▶ 0⏸ 0⚠');
  });

  it('resets idle state when activity resumes after being idle', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    flushDebounce();

    // Become idle
    manager.handleActivityChange('s1', false);
    flushIdle();
    flushDebounce();
    expect(mockTrayInstance.setTitle).toHaveBeenLastCalledWith(' 0▶ 1⏸ 0⚠');

    // Resume activity
    manager.handleActivityChange('s1', true);
    flushDebounce();
    expect(mockTrayInstance.setTitle).toHaveBeenLastCalledWith(' 1▶ 0⏸ 0⚠');
  });

  it('ignores activity changes for unknown sessions', () => {
    manager.handleActivityChange('unknown', false);
    flushDebounce();

    expect(mockTrayConstructor).not.toHaveBeenCalled();
  });

  // ─── handleSessionsDied ─────────────────────────────────────────────────────

  it('removes sessions and clears idle timers on handleSessionsDied', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    manager.handleStatusChange('s2', SessionStatus.Running);
    flushDebounce();

    // Start idle timer on s1
    manager.handleActivityChange('s1', false);

    manager.handleSessionsDied(['s1', 's2']);
    flushDebounce();

    // Tray should be destroyed since no sessions remain
    expect(mockTrayInstance.destroy).toHaveBeenCalled();
  });

  // ─── initFromSessions ──────────────────────────────────────────────────────

  it('rebuilds state from session list', () => {
    manager.initFromSessions([
      { id: 's1', status: SessionStatus.Running },
      { id: 's2', status: SessionStatus.WaitingForInput },
      { id: 's3', status: SessionStatus.Exited },
    ]);
    flushDebounce();

    // s3 (Exited) should not be tracked
    expect(mockTrayInstance.setTitle).toHaveBeenCalledWith(' 1▶ 0⏸ 1⚠');
  });

  it('initializes all sessions as not idle', () => {
    manager.initFromSessions([
      { id: 's1', status: SessionStatus.Running },
      { id: 's2', status: SessionStatus.Running },
    ]);
    flushDebounce();

    expect(mockTrayInstance.setTitle).toHaveBeenCalledWith(' 2▶ 0⏸ 0⚠');
  });

  // ─── Debouncing ─────────────────────────────────────────────────────────────

  it('debounces rapid updates', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    manager.handleStatusChange('s2', SessionStatus.Running);
    manager.handleStatusChange('s3', SessionStatus.Running);

    // No update yet — debounce not flushed
    expect(mockTrayInstance.setTitle).not.toHaveBeenCalled();

    flushDebounce();

    // Single update after debounce
    expect(mockTrayInstance.setTitle).toHaveBeenCalledTimes(1);
    expect(mockTrayInstance.setTitle).toHaveBeenCalledWith(' 3▶ 0⏸ 0⚠');
  });

  // ─── handleStatusChange edge cases ──────────────────────────────────────────

  it('clears idle timer when session becomes non-active', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    flushDebounce();

    // Start idle timer
    manager.handleActivityChange('s1', false);

    // Session exits — should clear the idle timer
    manager.handleStatusChange('s1', SessionStatus.Exited);
    flushDebounce();

    // Advance past what would have been the idle timeout
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 1000);
    flushDebounce();

    // Tray should be destroyed, not showing any idle sessions
    expect(mockTrayInstance.destroy).toHaveBeenCalled();
  });

  it('preserves idle state when status changes between active statuses', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    flushDebounce();

    // Become idle
    manager.handleActivityChange('s1', false);
    flushIdle();
    flushDebounce();

    // Status changes to WaitingForInput (still active, but now needs attention)
    manager.handleStatusChange('s1', SessionStatus.WaitingForInput);
    flushDebounce();

    // Should count as attention, not idle (attention takes priority)
    expect(mockTrayInstance.setTitle).toHaveBeenLastCalledWith(' 0▶ 0⏸ 1⚠');
  });

  // ─── clear ──────────────────────────────────────────────────────────────────

  it('cleans up all idle timers on clear', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    manager.handleStatusChange('s2', SessionStatus.Running);
    flushDebounce();

    manager.handleActivityChange('s1', false);
    manager.handleActivityChange('s2', false);

    manager.clear();

    // Advance past idle timeout — no errors or stale updates
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 1000);
    flushDebounce();

    // Tray was destroyed during clear
    expect(mockTrayInstance.destroy).toHaveBeenCalled();
  });

  // ─── Click behavior ────────────────────────────────────────────────────────

  it('registers click handler on tray creation', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    flushDebounce();

    expect(mockTrayInstance.on).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('click focuses existing window', () => {
    manager.handleStatusChange('s1', SessionStatus.Running);
    flushDebounce();

    const clickHandler = mockTrayInstance.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'click',
    )?.[1] as () => void;
    clickHandler();

    expect(mockShow).toHaveBeenCalled();
    expect(mockFocus).toHaveBeenCalled();
  });

  it('click creates window when no windows exist', async () => {
    const { BrowserWindow } = vi.mocked(await import('electron'));
    (BrowserWindow.getAllWindows as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);

    manager.handleStatusChange('s1', SessionStatus.Running);
    flushDebounce();

    const clickHandler = mockTrayInstance.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'click',
    )?.[1] as () => void;
    clickHandler();

    expect(createWindowFn).toHaveBeenCalled();
  });
});
