import { useState, useEffect } from 'react';
import { usePlatform } from '../platform/usePlatform.js';

export function useHasVscode(): boolean {
  const platform = usePlatform();
  const [hasVscode, setHasVscode] = useState(false);

  useEffect(() => {
    if (platform.kind !== 'electron') {
      setHasVscode(false);
      return;
    }
    platform.orca.shell
      .hasVscode()
      .then(setHasVscode)
      .catch(() => setHasVscode(false));
  }, [platform]);

  return hasVscode;
}
