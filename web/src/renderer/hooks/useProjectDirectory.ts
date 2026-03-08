import { useState, useEffect, useCallback } from 'react';

interface UseProjectDirectoryResult {
  directory: string | undefined;
  loading: boolean;
  updateDirectory: (directory: string) => Promise<void>;
}

export function useProjectDirectory(projectId: string | undefined): UseProjectDirectoryResult {
  const [directory, setDirectory] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setDirectory(undefined);
      setLoading(false);
      return;
    }

    setLoading(true);
    window.orca.projectDir
      .get(projectId)
      .then((result) => {
        setDirectory(result?.directory);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const updateDirectory = useCallback(
    async (dir: string) => {
      if (!projectId) return;
      const result = await window.orca.projectDir.set(projectId, dir);
      setDirectory(result.directory);
    },
    [projectId],
  );

  return { directory, loading, updateDirectory };
}
