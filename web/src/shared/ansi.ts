/**
 * ANSI escape sequence utilities.
 *
 * Provides stripping of terminal control characters so that output size
 * measurements reflect only visible text — not cursor positioning, color
 * codes, or status-bar updates that Claude Code's TUI emits while idle.
 */

/**
 * Regex that matches all common ANSI escape sequences:
 * - CSI (Control Sequence Introducer): ESC [ … final-byte
 * - OSC (Operating System Command): ESC ] … ST
 * - DCS (Device Control String): ESC P … ST
 * - C1 control codes: ESC followed by [N-_]
 * - Single-byte C0 controls that are not printable (except \n, \r, \t)
 *
 * Note: OSC/DCS sequences split across two PTY data chunks will not be stripped
 * from the first chunk (the terminator is in the next chunk). This causes a small
 * constant inflation in visible length that is absorbed by the resume threshold.
 */
const ANSI_RE =
  /[\u001B\u009B][\[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]|[\u001B\u009B][P\]^_](?:.*?)(?:\u0007|\u001B\\)|[\u0000-\u0008\u000B\u000C\u000E-\u001A]/g;

/** Strip all ANSI escape sequences from a string, returning only visible text. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

/** Return the length of visible (non-ANSI) content in `data` without allocating a stripped copy. */
export function visibleLength(data: string): number {
  let ansiLen = 0;
  for (const m of data.matchAll(ANSI_RE)) {
    ansiLen += m[0].length;
  }
  return data.length - ansiLen;
}
