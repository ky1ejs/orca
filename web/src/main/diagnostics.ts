import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir, type, release, arch, totalmem } from 'node:os';
import { app, dialog } from 'electron';
import { ORCA_DIR, DAEMON_LOG_FILE, MAIN_LOG_FILE } from '../shared/daemon-protocol.js';
import { logger } from './logger.js';

function collectLogFiles(): string[] {
  const files: string[] = [];
  if (!existsSync(ORCA_DIR)) return files;

  const entries = readdirSync(ORCA_DIR);
  for (const entry of entries) {
    // Match daemon.log, daemon.log.1, main.log, main.log.2, etc.
    if (/^(daemon|main)\.log(\.\d+)?$/.test(entry)) {
      files.push(join(ORCA_DIR, entry));
    }
  }
  return files;
}

function generateSystemInfo(): string {
  const lines: string[] = [];

  lines.push('=== Orca Diagnostic Info ===');
  lines.push(`Date: ${new Date().toISOString()}`);
  lines.push('');

  // App versions
  lines.push('--- Versions ---');
  lines.push(`Orca: ${app.getVersion()}`);
  lines.push(`Electron: ${process.versions.electron}`);
  lines.push(`Node: ${process.versions.node}`);
  lines.push(`Chrome: ${process.versions.chrome}`);
  lines.push('');

  // OS info
  lines.push('--- System ---');
  lines.push(`OS: ${type()} ${release()}`);
  lines.push(`Arch: ${arch()}`);
  lines.push(`Total Memory: ${Math.round(totalmem() / 1024 / 1024)} MB`);
  lines.push(`Process Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB RSS`);
  lines.push('');

  // Uptime
  lines.push('--- Uptime ---');
  lines.push(`App: ${Math.round(process.uptime())}s`);
  lines.push('');

  // Daemon status
  lines.push('--- Daemon ---');
  lines.push(`Log file: ${DAEMON_LOG_FILE}`);
  lines.push(`Main log file: ${MAIN_LOG_FILE}`);

  return lines.join('\n') + '\n';
}

export async function exportDiagnostics(): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const defaultName = `orca-diagnostics-${date}.zip`;

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export Diagnostic Logs',
    defaultPath: join(app.getPath('desktop'), defaultName),
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  });

  if (canceled || !filePath) return;

  const tmpDir = mkdtempSync(join(tmpdir(), 'orca-diag-'));

  try {
    // Write system info
    writeFileSync(join(tmpDir, 'system-info.txt'), generateSystemInfo());

    // Copy log files
    const logFiles = collectLogFiles();
    for (const logFile of logFiles) {
      cpSync(logFile, join(tmpDir, basename(logFile)));
    }

    // Create zip using ditto (macOS)
    execFileSync('ditto', ['-c', '-k', tmpDir, filePath]);

    await dialog.showMessageBox({
      type: 'info',
      title: 'Diagnostic Logs Exported',
      message: 'Logs exported successfully',
      detail: `Saved to: ${filePath}`,
    });

    logger.info(`Diagnostic logs exported to ${filePath}`);
  } catch (err) {
    logger.error('Failed to export diagnostic logs', err);
    await dialog.showMessageBox({
      type: 'error',
      title: 'Export Failed',
      message: 'Failed to export diagnostic logs',
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
