import { useState, useEffect, type ReactNode } from 'react';
import { Provider, type Client } from 'urql';
import { createGraphQLClient } from './client.js';

interface GraphQLProviderProps {
  children: ReactNode;
}

export function GraphQLProvider({ children }: GraphQLProviderProps) {
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createGraphQLClient()
      .then(setClient)
      .catch((err) => {
        console.error('Failed to create GraphQL client:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize GraphQL client');
      });
  }, []);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-red-400">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-2">Connection Error</h1>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400">
        <div className="text-center">
          <p className="text-sm">Connecting...</p>
        </div>
      </div>
    );
  }

  return <Provider value={client}>{children}</Provider>;
}
