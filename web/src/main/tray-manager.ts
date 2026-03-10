import { Tray, BrowserWindow, nativeImage } from 'electron';
import { isActiveSessionStatus, SessionStatus } from '../shared/session-status.js';

const DEBOUNCE_MS = 100;
const IDLE_TIMEOUT_MS = 20_000;

/** Tray-specific attention check: broader than the shared isNeedsAttentionStatus (dock badge). */
const TRAY_ATTENTION_STATUSES: readonly string[] = [
  SessionStatus.WaitingForInput,
  SessionStatus.AwaitingPermission,
];

function isTrayAttentionStatus(status: string): boolean {
  return TRAY_ATTENTION_STATUSES.includes(status);
}

interface TrackedSession {
  status: string;
  idle: boolean;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Manages a macOS menu bar tray icon showing agent status counts.
 * Shows counts for in-progress (▶), idle (⏸), and needs-attention (⚠) sessions.
 * The tray only appears when active sessions exist.
 */
export class TrayManager {
  private tray: Tray | null = null;
  private sessions = new Map<string, TrackedSession>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private iconPath: string;
  private createWindowFn: () => void;

  constructor(iconPath: string, createWindowFn: () => void) {
    this.iconPath = iconPath;
    this.createWindowFn = createWindowFn;
  }

  handleStatusChange(sessionId: string, status: string): void {
    if (isActiveSessionStatus(status)) {
      const existing = this.sessions.get(sessionId);
      this.sessions.set(sessionId, {
        status,
        idle: existing?.idle ?? false,
        idleTimer: existing?.idleTimer ?? null,
      });
    } else {
      const existing = this.sessions.get(sessionId);
      if (existing?.idleTimer) clearTimeout(existing.idleTimer);
      this.sessions.delete(sessionId);
    }
    this.scheduleUpdate();
  }

  handleActivityChange(sessionId: string, active: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (active) {
      if (session.idleTimer) {
        clearTimeout(session.idleTimer);
        session.idleTimer = null;
      }
      if (session.idle) {
        session.idle = false;
        this.scheduleUpdate();
      }
    } else {
      if (!session.idleTimer && !session.idle) {
        session.idleTimer = setTimeout(() => {
          session.idleTimer = null;
          session.idle = true;
          this.scheduleUpdate();
        }, IDLE_TIMEOUT_MS);
      }
    }
  }

  handleSessionsDied(sessionIds: string[]): void {
    for (const id of sessionIds) {
      const existing = this.sessions.get(id);
      if (existing?.idleTimer) clearTimeout(existing.idleTimer);
      this.sessions.delete(id);
    }
    this.scheduleUpdate();
  }

  initFromSessions(sessions: Array<{ id: string; status: string }>): void {
    for (const session of this.sessions.values()) {
      if (session.idleTimer) clearTimeout(session.idleTimer);
    }
    this.sessions.clear();
    for (const s of sessions) {
      if (isActiveSessionStatus(s.status)) {
        this.sessions.set(s.id, { status: s.status, idle: false, idleTimer: null });
      }
    }
    this.scheduleUpdate();
  }

  clear(): void {
    for (const session of this.sessions.values()) {
      if (session.idleTimer) clearTimeout(session.idleTimer);
    }
    this.sessions.clear();
    this.destroyTray();
  }

  private scheduleUpdate(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.updateTray();
    }, DEBOUNCE_MS);
  }

  private updateTray(): void {
    if (this.sessions.size === 0) {
      this.destroyTray();
      return;
    }

    let inProgress = 0;
    let idle = 0;
    let attention = 0;

    for (const session of this.sessions.values()) {
      if (isTrayAttentionStatus(session.status)) {
        attention++;
      } else if (session.idle) {
        idle++;
      } else {
        inProgress++;
      }
    }

    const title = ` ${inProgress}▶ ${idle}⏸ ${attention}⚠`;
    const tooltip = `${inProgress} working, ${idle} idle, ${attention} needs attention`;

    if (!this.tray) {
      const icon = nativeImage.createFromPath(this.iconPath);
      icon.setTemplateImage(true);
      this.tray = new Tray(icon);
      this.tray.on('click', () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          win.show();
          win.focus();
        } else {
          this.createWindowFn();
        }
      });
    }

    this.tray.setTitle(title);
    this.tray.setToolTip(tooltip);
  }

  private destroyTray(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
