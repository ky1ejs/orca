/**
 * Kitty keyboard protocol interceptor.
 *
 * xterm.js doesn't support the kitty keyboard protocol, so programs like
 * Claude Code that query for it (`\x1b[?u`) never activate their CSI u
 * parser. This filter sits in the PTY data flow and:
 *
 *  1. Responds to protocol queries on behalf of xterm.js
 *  2. Strips push/pop sequences that xterm.js can't handle
 *
 * This allows the existing Shift+Enter handler (which sends `\x1b[13;2u`)
 * to be recognized by Claude Code.
 */

const CSI_PREFIX = '\x1b[';
const QUERY = '\x1b[?u';
const QUERY_RESPONSE = '\x1b[?1u';

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
  const output = data.replace(/\x1b\[\?u|\x1b\[>\d*u|\x1b\[<\d*u/g, (match) => {
    if (match === QUERY) {
      response += QUERY_RESPONSE;
    }
    return '';
  });

  return { output, response };
}
