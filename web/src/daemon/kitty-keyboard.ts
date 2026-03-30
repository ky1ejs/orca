/**
 * Terminal protocol interceptor for Claude Code compatibility.
 *
 * Claude Code uses the kitty keyboard protocol to handle Shift+Enter (CSI u
 * encoding: `\x1b[13;2u`) and other modified keys. It activates the CSI u key
 * parser for terminals it recognises — we set `TERM_PROGRAM=ghostty` in
 * pty-manager.ts to trigger this.
 *
 * Once the mode is pushed, Claude Code writes escape sequences that xterm.js
 * (v6.0) can't handle. This filter sits in the PTY output path and:
 *
 *  1. Responds to protocol queries (`\x1b[?u`) on behalf of xterm.js
 *  2. Strips push/pop sequences (`\x1b[>Nu`, `\x1b[<Nu`) before they
 *     reach xterm.js, which would display them as garbage
 *  3. Strips modifyOtherKeys sequences (`\x1b[>4;2m`, `\x1b[>4m`) that
 *     xterm.js doesn't understand
 *
 * The corresponding key handlers live in AgentTerminal.tsx — they intercept
 * browser keydown events and write CSI u sequences to the PTY.
 */

const CSI_PREFIX = '\x1b[';
const QUERY = '\x1b[?u';
const QUERY_RESPONSE = '\x1b[?1u';

/**
 * The TERM_PROGRAM value we inject so Claude Code recognises the terminal
 * and pushes kitty keyboard mode. Must be one of Claude Code's hardcoded
 * set: iTerm.app, kitty, WezTerm, ghostty.
 */
export const KITTY_TERM_PROGRAM = 'ghostty';

interface FilterResult {
  /** Data to forward to xterm.js / output buffer */
  output: string;
  /** Data to write back to the PTY (protocol responses) */
  response: string;
}

// Matches all terminal protocol sequences we need to intercept:
//   \x1b[?u        — kitty keyboard: query current mode
//   \x1b[>N u      — kitty keyboard: push mode (flags only)
//   \x1b[>N;M u    — kitty keyboard: push mode (flags + disposition)
//   \x1b[<N u      — kitty keyboard: pop mode (with optional count)
//   \x1b[>4;2m     — modifyOtherKeys: enable mode 2
//   \x1b[>4m       — modifyOtherKeys: disable
const PROTOCOL_RE = /\x1b\[\?u|\x1b\[>[0-9;]*u|\x1b\[<[0-9]*u|\x1b\[>4;?2?m/g;

export function processTerminalProtocol(data: string): FilterResult {
  if (!data.includes(CSI_PREFIX)) {
    return { output: data, response: '' };
  }

  let response = '';
  const output = data.replace(PROTOCOL_RE, (match) => {
    if (match === QUERY) {
      response += QUERY_RESPONSE;
    }
    return '';
  });

  return { output, response };
}
