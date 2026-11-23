const EXTERNAL_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Whether a link the renderer tries to open may go to the OS. Task text can
 * come from outside the team, so a file://, custom-scheme or relative URL
 * (which resolves to file:// in the packaged app) is never handed to
 * shell.openExternal, which would open or launch it.
 */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_LINK_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}
