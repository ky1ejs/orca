import { readFileSync, existsSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { type McpToolsDeps, toolSuccess } from './helpers.js';
import { DAEMON_LOG_FILE, MAIN_LOG_FILE } from '../../daemon-protocol.js';

const LOG_FILES = [
  ['daemon', DAEMON_LOG_FILE],
  ['main', MAIN_LOG_FILE],
] as const;

function readLogs(options: {
  filter?: string;
  level?: string;
  source?: string;
  tail: number;
}): string {
  const { filter, level, source } = options;
  const tail = Math.max(1, Math.min(options.tail, 500));
  const sections: string[] = [];

  const files = source ? LOG_FILES.filter(([label]) => label === source) : LOG_FILES;

  for (const [label, path] of files) {
    if (!existsSync(path)) {
      sections.push(`## ${label} (${path})\nNo log file found.`);
      continue;
    }

    try {
      const content = readFileSync(path, 'utf-8');
      let lines = content.split('\n').filter((line) => line.length > 0);

      if (level) {
        const levelUpper = `[${level.toUpperCase()}]`;
        lines = lines.filter((line) => line.includes(levelUpper));
      }

      if (filter) {
        lines = lines.filter((line) => line.includes(filter));
      }

      const recent = lines.slice(-tail);
      if (recent.length === 0) {
        sections.push(`## ${label} (${path})\nNo matching entries found.`);
      } else {
        sections.push(`## ${label} (${path})\n${recent.join('\n')}`);
      }
    } catch (err) {
      sections.push(`## ${label} (${path})\nError reading log: ${err}`);
    }
  }

  return sections.join('\n\n');
}

export function registerPerfTools(server: McpServer, _deps: McpToolsDeps): void {
  server.registerTool(
    'get_logs',
    {
      description:
        'Read Orca app logs from the daemon and main process. Supports filtering by log level, source, and arbitrary text pattern. Useful for debugging issues, checking errors, and reviewing performance traces.',
      inputSchema: {
        filter: z
          .string()
          .optional()
          .describe('Text pattern to filter log lines (e.g. "[perf]", "agent.launch", "error").'),
        level: z
          .enum(['debug', 'info', 'warn', 'error'])
          .optional()
          .describe('Filter by log level.'),
        source: z
          .enum(['daemon', 'main'])
          .optional()
          .describe('Read logs from a specific source only. Omit to read both.'),
        tail: z
          .number()
          .optional()
          .describe('Number of most recent matching lines to return per log file. Defaults to 50.'),
      },
    },
    async ({ filter, level, source, tail }) => {
      return toolSuccess(readLogs({ filter, level, source, tail: tail ?? 50 }));
    },
  );

  server.registerTool(
    'get_perf_logs',
    {
      description:
        'Get performance timing logs from the Orca app. Shortcut for get_logs with filter="[perf]". Returns timing data from daemon, main process, and renderer. Useful for diagnosing slow task opens or terminal startup.',
      inputSchema: {
        tail: z
          .number()
          .optional()
          .describe('Number of most recent [perf] lines to return per log file. Defaults to 50.'),
      },
    },
    async ({ tail }) => {
      return toolSuccess(readLogs({ filter: '[perf]', tail: tail ?? 50 }));
    },
  );
}
