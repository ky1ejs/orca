import { appendFileSync, renameSync, statSync, existsSync } from 'node:fs';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  filePath: string;
  level?: LogLevel;
  maxSize?: number;
  maxFiles?: number;
  stderr?: boolean;
  tag?: string;
}

interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string, err?: unknown): void;
  setLevel(level: LogLevel): void;
  readonly filePath: string;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? err.message;
  }
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function createLogger(options: LoggerOptions): Logger {
  const { filePath, maxSize = 5 * 1024 * 1024, maxFiles = 3, stderr = true, tag } = options;
  let currentLevel = options.level ?? 'info';

  function rotate(): void {
    try {
      const stats = statSync(filePath);
      if (stats.size < maxSize) return;
    } catch {
      return;
    }

    // Shift existing rotated files: .2 -> .3, .1 -> .2, etc.
    for (let i = maxFiles - 1; i >= 2; i--) {
      const from = `${filePath}.${i - 1}`;
      const to = `${filePath}.${i}`;
      if (existsSync(from)) {
        try {
          renameSync(from, to);
        } catch {
          // Best effort
        }
      }
    }

    // Rotate current file to .1
    try {
      renameSync(filePath, `${filePath}.1`);
    } catch {
      // Best effort
    }
  }

  function write(level: LogLevel, msg: string, err?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel]) return;

    const timestamp = new Date().toISOString();
    const levelLabel = level.toUpperCase();
    const tagPart = tag ? ` [${tag}]` : '';
    let line = `[${timestamp}] [${levelLabel}]${tagPart} ${msg}\n`;

    if (err !== undefined) {
      const errStr = formatError(err);
      const indented = errStr
        .split('\n')
        .map((l) => `  ${l}`)
        .join('\n');
      line += `${indented}\n`;
    }

    rotate();

    try {
      appendFileSync(filePath, line);
    } catch {
      // Ignore log write errors
    }

    if (stderr) {
      process.stderr.write(line);
    }
  }

  return {
    debug: (msg) => write('debug', msg),
    info: (msg) => write('info', msg),
    warn: (msg) => write('warn', msg),
    error: (msg, err?) => write('error', msg, err),
    setLevel: (level) => {
      currentLevel = level;
    },
    get filePath() {
      return filePath;
    },
  };
}
