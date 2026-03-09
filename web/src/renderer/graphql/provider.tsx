import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Provider, type Client } from 'urql';
import { createGraphQLClient } from './client.js';

interface GraphQLProviderProps {
  children: ReactNode;
}

export function GraphQLProvider({ children }: GraphQLProviderProps) {
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    createGraphQLClient()
      .then((handle) => {
        if (cancelled) {
          handle.dispose();
          return;
        }
        disposeRef.current = handle.dispose;
        setClient(handle.client);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to create GraphQL client:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize GraphQL client');
      });

    return () => {
      cancelled = true;
      disposeRef.current?.();
      disposeRef.current = null;
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface text-error">
        <div className="text-center">
          <h1 className="text-heading-md font-bold mb-2">Connection Error</h1>
          <p className="text-body-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface text-fg-muted">
        <div className="text-center">
          <p className="text-body-sm">Connecting...</p>
        </div>
      </div>
    );
  }

  return <Provider value={client}>{children}</Provider>;
}
