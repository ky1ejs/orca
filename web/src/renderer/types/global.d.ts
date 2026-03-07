import type { OrcaAPI } from '../../preload/index.js';

declare global {
  interface Window {
    orca: OrcaAPI & {
      db: OrcaAPI['db'] & {
        getAuthToken: () => Promise<string | null>;
      };
    };
  }
}
