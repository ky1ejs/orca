/**
 * Icon sizing tokens.
 *
 * Placeholder — will be merged into the design-system package once it lands.
 *
 * Usage:
 *   import { iconSize } from '../../tokens/icon-size.js';
 *   <Bell className={iconSize.sm} />
 *
 * Tiers:
 *   xs  — compact contexts: disclosure chevrons, tab close buttons, inline badges
 *   sm  — default for all buttons, navigation, actions, close/dismiss
 *   md  — prominent standalone icons: collapsed sidebar toolbar
 *   lg  — empty-state illustrations only (pairs with strokeWidth 1.5)
 */
export const iconSize = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-12 h-12',
} as const;

/** strokeWidth to pair with `iconSize.lg` for empty-state illustrations. */
export const iconStroke = {
  lg: 1.5,
} as const;
