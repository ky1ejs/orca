import { mkdirSync } from 'node:fs';
import { createLogger, type LogLevel } from '../shared/logger.js';
import { ORCA_DIR, DAEMON_LOG_FILE } from '../shared/daemon-protocol.js';

mkdirSync(ORCA_DIR, { recursive: true });

function getArg(name: string, defaultValue: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return defaultValue;
}

export const logger: ReturnType<typeof createLogger> = createLogger({
  filePath: DAEMON_LOG_FILE,
  tag: 'daemon',
  level: getArg('log-level', 'info') as LogLevel,
});
