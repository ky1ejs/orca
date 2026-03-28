import { readFileSync, existsSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { type McpToolsDeps, toolError, toolSuccess } from './helpers.js';
import { DAEMON_LOG_FILE, MAIN_LOG_FILE } from '../../daemon-protocol.js';

export function registerPerfTools(server: McpServer, _deps: McpToolsDeps): void {
  server.registerTool(
    'get_perf_logs',
    {
      description:
        'Get performance timing logs from the Orca app. Returns [perf] entries from daemon, main process, and renderer logs. Useful for diagnosing slow task opens or terminal startup.',
      inputSchema: {
        tail: z
          .number()
          .optional()
          .describe(
            'Number of most recent [perf] lines to return from each log file. Defaults to 50.',
          ),
      },
    },
    async ({ tail }) => {
      const maxLines = tail ?? 50;
      const sections: string[] = [];

      for (const [label, path] of [
        ['daemon', DAEMON_LOG_FILE],
        ['main', MAIN_LOG_FILE],
      ] as const) {
        if (!existsSync(path)) {
          sections.push(`## ${label} (${path})\nNo log file found.`);
          continue;
        }

        try {
          const content = readFileSync(path, 'utf-8');
          const perfLines = content.split('\n').filter((line) => line.includes('[perf]'));
          const recent = perfLines.slice(-maxLines);
          if (recent.length === 0) {
            sections.push(`## ${label} (${path})\nNo [perf] entries found.`);
          } else {
            sections.push(`## ${label} (${path})\n${recent.join('\n')}`);
          }
        } catch (err) {
          sections.push(`## ${label} (${path})\nError reading log: ${err}`);
        }
      }

      if (sections.every((s) => s.includes('No [perf] entries') || s.includes('No log file'))) {
        return toolError(
          'No performance logs found. Open a task terminal first, then try again.',
        );
      }

      return toolSuccess(sections.join('\n\n'));
    },
  );
}
