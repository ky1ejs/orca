import { nativeTheme } from 'electron';
import { getSetting } from './settings.js';

/**
 * Resolve the effective color scheme by checking the user's preference
 * and falling back to the OS setting when set to 'system'.
 */
export function resolveColorScheme(): 'light' | 'dark' {
  const colorScheme = getSetting('appearance.colorScheme');
  const isDark =
    colorScheme === 'dark' || (colorScheme !== 'light' && nativeTheme.shouldUseDarkColors);
  return isDark ? 'dark' : 'light';
}
