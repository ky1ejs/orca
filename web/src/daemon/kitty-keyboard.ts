/**
 * Kitty keyboard protocol interceptor.
 *
 * Claude Code uses the kitty keyboard protocol to handle Shift+Enter (CSI u
 * encoding: `\x1b[13;2u`). It only activates the CSI u key parser after
 * pushing kitty keyboard mode, which it does for terminals it recognises —
 * we set `TERM_PROGRAM=ghostty` in pty-manager.ts to trigger this.
 *
 * Once the mode is pushed, Claude Code writes escape sequences that xterm.js
 * (v6.0) can't handle. This filter sits in the PTY output path and:
 *
 *  1. Responds to protocol queries (`\x1b[?u`) on behalf of xterm.js
 *  2. Strips push/pop sequences (`\x1b[>Nu`, `\x1b[<Nu`) before they
 *     reach xterm.js, which would display them as garbage
 *
 * The corresponding Shift+Enter key handler lives in AgentTerminal.tsx —
 * it intercepts the browser keydown event and writes `\x1b[13;2u` to the PTY.
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

export function processKittyKeyboard(data: string): FilterResult {
  if (!data.includes(CSI_PREFIX)) {
    return { output: data, response: '' };
  }

  let response = '';
  // Match all kitty keyboard protocol sequences:
  //   \x1b[?u        — query current mode
  //   \x1b[>N u      — push mode (simple: flags only)
  //   \x1b[>N;M u    — push mode (extended: flags + disposition, e.g. set/or/not)
  //   \x1b[<N u      — pop mode (with optional count)
  const output = data.replace(/\x1b\[\?u|\x1b\[>[0-9;]*u|\x1b\[<[0-9;]*u/g, (match) => {
    if (match === QUERY) {
      response += QUERY_RESPONSE;
    }
    return '';
  });

  return { output, response };
}
