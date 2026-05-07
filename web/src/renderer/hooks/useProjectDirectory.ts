import { useState, useEffect, useCallback } from 'react';
import { usePlatform } from '../platform/usePlatform.js';

interface UseProjectDirectoryResult {
  directory: string | undefined;
  loading: boolean;
  updateDirectory: (directory: string) => Promise<void>;
}

export function useProjectDirectory(projectId: string | undefined): UseProjectDirectoryResult {
  const platform = usePlatform();
  const [directory, setDirectory] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(platform.kind === 'electron');

  useEffect(() => {
    if (platform.kind !== 'electron' || !projectId) {
      setDirectory(undefined);
      setLoading(false);
      return;
    }

    setLoading(true);
    platform.orca.projectDir
      .get(projectId)
      .then((result) => {
        setDirectory(result?.directory);
      })
      .finally(() => setLoading(false));
  }, [platform, projectId]);

  const updateDirectory = useCallback(
    async (dir: string) => {
      if (platform.kind !== 'electron' || !projectId) return;
      const result = await platform.orca.projectDir.set(projectId, dir);
      setDirectory(result.directory);
    },
    [platform, projectId],
  );

  return { directory, loading, updateDirectory };
}
