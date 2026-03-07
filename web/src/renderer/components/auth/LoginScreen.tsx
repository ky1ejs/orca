import { useState, type FormEvent } from 'react';
import { clearCachedToken } from '../../graphql/client.js';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  `http://localhost:${import.meta.env.VITE_BACKEND_PORT || '4000'}`;
const GRAPHQL_URL = `${BACKEND_URL}/graphql`;

interface LoginScreenProps {
  onLogin: () => void;
  sessionExpired?: boolean;
}

export function LoginScreen({ onLogin, sessionExpired }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    sessionExpired ? 'Your session expired \u2014 please sign in again.' : null,
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Login($email: String!, $password: String!) {
            login(email: $email, password: $password) {
              token
              user { id name email }
            }
          }`,
          operationName: 'Login',
          variables: { email, password },
        }),
      });

      if (!res.ok) {
        setError('Something went wrong. Please try again.');
        return;
      }

      const json = await res.json();

      if (json.errors?.length) {
        const code = json.errors[0]?.extensions?.code;
        if (code === 'UNAUTHENTICATED') {
          setError('Incorrect email or password.');
        } else {
          setError('Something went wrong. Please try again.');
        }
        return;
      }

      const token = json.data?.login?.token;
      if (!token) {
        setError('Something went wrong. Please try again.');
        return;
      }

      // Store the token
      clearCachedToken();
      if (window.orca) {
        await window.orca.auth.storeToken(token);
      }

      onLogin();
    } catch {
      setError('Cannot connect to server. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-100">
      <div className="w-full max-w-sm px-6">
        <h1 className="text-2xl font-bold text-center mb-8">Orca</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded bg-red-900/40 border border-red-800 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-400 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
