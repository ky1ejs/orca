export function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/sh';
}

/**
 * Returns args to launch the shell as a login shell.
 * On macOS/Linux, login shells source /etc/profile (which runs path_helper)
 * and user profile files, ensuring PATH includes standard directories
 * like /usr/local/bin.
 */
export function getLoginShellArgs(): string[] {
  if (process.platform === 'win32') {
    return [];
  }
  return ['-l'];
}
