import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetBadge = vi.fn();

vi.mock('electron', () => ({
  app: { dock: { setBadge: (...args: unknown[]) => mockSetBadge(...args) } },
}));

const { DockBadgeManager } = await import('./dock-badge.js');

describe('DockBadgeManager', () => {
  let manager: InstanceType<typeof DockBadgeManager>;

  beforeEach(() => {
    manager = new DockBadgeManager();
    mockSetBadge.mockClear();
  });

  it('sets badge when a session needs attention', () => {
    manager.handleStatusChange('s1', 'AWAITING_PERMISSION');
    expect(mockSetBadge).toHaveBeenCalledWith('1');
  });

  it('clears badge when session moves to running', () => {
    manager.handleStatusChange('s1', 'AWAITING_PERMISSION');
    mockSetBadge.mockClear();

    manager.handleStatusChange('s1', 'RUNNING');
    expect(mockSetBadge).toHaveBeenCalledWith('');
  });

  it('counts multiple sessions needing attention', () => {
    manager.handleStatusChange('s1', 'AWAITING_PERMISSION');
    manager.handleStatusChange('s2', 'WAITING_FOR_INPUT');
    expect(mockSetBadge).toHaveBeenLastCalledWith('2');
  });

  it('decrements when a session dies', () => {
    manager.handleStatusChange('s1', 'AWAITING_PERMISSION');
    manager.handleStatusChange('s2', 'WAITING_FOR_INPUT');
    mockSetBadge.mockClear();

    manager.handleSessionsDied(['s1']);
    expect(mockSetBadge).toHaveBeenCalledWith('1');
  });

  it('does not call setBadge if count unchanged', () => {
    manager.handleStatusChange('s1', 'RUNNING');
    mockSetBadge.mockClear();

    manager.handleStatusChange('s1', 'RUNNING');
    expect(mockSetBadge).not.toHaveBeenCalled();
  });

  it('initializes from existing sessions, ignoring terminal statuses', () => {
    manager.initFromSessions([
      { id: 's1', status: 'AWAITING_PERMISSION' },
      { id: 's2', status: 'RUNNING' },
      { id: 's3', status: 'WAITING_FOR_INPUT' },
      { id: 's4', status: 'EXITED' },
      { id: 's5', status: 'ERROR' },
    ]);
    expect(mockSetBadge).toHaveBeenCalledWith('2');
  });

  it('prunes sessions that move to terminal status', () => {
    manager.handleStatusChange('s1', 'AWAITING_PERMISSION');
    manager.handleStatusChange('s2', 'AWAITING_PERMISSION');
    mockSetBadge.mockClear();

    manager.handleStatusChange('s1', 'EXITED');
    expect(mockSetBadge).toHaveBeenCalledWith('1');
  });

  it('clears everything on clear()', () => {
    manager.handleStatusChange('s1', 'AWAITING_PERMISSION');
    mockSetBadge.mockClear();

    manager.clear();
    expect(mockSetBadge).toHaveBeenCalledWith('');
  });
});
