/**
 * Icon sizing tokens — backed by Fathom design system (`fathom.css`).
 *
 * Uses `size-icon-*` utilities defined in `@theme extend`, which set
 * both width and height from a single class.
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
  xs: 'size-icon-xs',
  sm: 'size-icon-sm',
  md: 'size-icon-md',
  lg: 'size-icon-lg',
} as const;

/** strokeWidth to pair with `iconSize.lg` for empty-state illustrations. */
export const iconStroke = {
  lg: 1.5,
} as const;
