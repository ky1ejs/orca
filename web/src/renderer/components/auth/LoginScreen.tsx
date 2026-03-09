import { useState, type FormEvent } from 'react';
import { GRAPHQL_URL, storeAuthToken } from '../../graphql/client.js';

interface LoginScreenProps {
  onLogin: () => void;
  onRegister?: () => void;
  sessionExpired?: boolean;
}

export function LoginScreen({ onLogin, onRegister, sessionExpired }: LoginScreenProps) {
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

      await storeAuthToken(token);
      onLogin();
    } catch {
      setError('Cannot connect to server. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-surface text-fg">
      <div className="w-full max-w-sm px-6">
        <h1 className="text-heading-lg font-bold text-center mb-8">Orca</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded bg-error-muted border border-error-strong px-3 py-2 text-body-sm text-error">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-label-md font-medium text-fg-muted mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-edge-subtle bg-surface-raised px-3 py-2 text-body-sm text-fg placeholder-fg-faint focus:border-edge-subtle focus:outline-none focus:ring-1 focus:ring-edge-subtle"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-label-md font-medium text-fg-muted mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-edge-subtle bg-surface-raised px-3 py-2 text-body-sm text-fg placeholder-fg-faint focus:border-edge-subtle focus:outline-none focus:ring-1 focus:ring-edge-subtle"
              placeholder="Password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-accent px-4 py-2 text-label-md font-medium text-on-accent hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-edge-subtle focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        {onRegister && (
          <p className="mt-4 text-center text-body-sm text-fg-faint">
            Don&apos;t have an account?{' '}
            <button type="button" onClick={onRegister} className="text-fg-muted hover:text-fg">
              Create account
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
