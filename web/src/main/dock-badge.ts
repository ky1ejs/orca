import { app } from 'electron';
import { isActiveSessionStatus, isNeedsAttentionStatus } from '../shared/session-status.js';

/**
 * Tracks session statuses and syncs the "needs attention" count to the macOS dock badge.
 */
export class DockBadgeManager {
  private statuses = new Map<string, string>();
  private lastBadgeCount = 0;

  handleStatusChange(sessionId: string, status: string): void {
    if (isActiveSessionStatus(status)) {
      this.statuses.set(sessionId, status);
    } else {
      this.statuses.delete(sessionId);
    }
    this.updateBadge();
  }

  handleSessionsDied(sessionIds: string[]): void {
    for (const id of sessionIds) {
      this.statuses.delete(id);
    }
    this.updateBadge();
  }

  initFromSessions(sessions: Array<{ id: string; status: string }>): void {
    this.statuses.clear();
    for (const s of sessions) {
      if (isActiveSessionStatus(s.status)) {
        this.statuses.set(s.id, s.status);
      }
    }
    this.updateBadge();
  }

  clear(): void {
    this.statuses.clear();
    this.updateBadge();
  }

  private updateBadge(): void {
    let count = 0;
    for (const status of this.statuses.values()) {
      if (isNeedsAttentionStatus(status)) {
        count++;
      }
    }
    if (count !== this.lastBadgeCount) {
      this.lastBadgeCount = count;
      app.dock?.setBadge(count > 0 ? String(count) : '');
    }
  }
}
