import { mkdirSync } from 'node:fs';
import { createLogger, type LogLevel } from '../shared/logger.js';
import { ORCA_DIR, MAIN_LOG_FILE } from '../shared/daemon-protocol.js';

mkdirSync(ORCA_DIR, { recursive: true });

export const logger: ReturnType<typeof createLogger> = createLogger({
  filePath: MAIN_LOG_FILE,
  tag: 'main',
  level: (process.env.ORCA_LOG_LEVEL as LogLevel) ?? 'info',
});
