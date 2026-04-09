import { useState, useEffect } from 'react';

export function useHasVscode(): boolean {
  const [hasVscode, setHasVscode] = useState(false);

  useEffect(() => {
    window.orca.shell
      .hasVscode()
      .then(setHasVscode)
      .catch(() => setHasVscode(false));
  }, []);

  return hasVscode;
}
