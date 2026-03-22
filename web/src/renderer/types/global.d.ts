import type { OrcaAPI } from '../../preload/index.js';

declare global {
  interface Window {
    orca: OrcaAPI;
  }

  /** Electron adds an absolute-path property to File objects in the renderer. */
  interface File {
    readonly path: string;
  }
}
