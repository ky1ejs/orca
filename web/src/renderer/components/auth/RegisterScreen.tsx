import { useState, type FormEvent } from 'react';
import { GRAPHQL_URL, storeAuthToken } from '../../graphql/client.js';

interface RegisterScreenProps {
  onRegister: () => void;
  onBack: () => void;
}

export function RegisterScreen({ onRegister, onBack }: RegisterScreenProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
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
          query: `mutation Register($input: RegisterInput!) {
            register(input: $input) {
              token
              user { id name email }
            }
          }`,
          operationName: 'Register',
          variables: { input: { email, name, password, inviteCode } },
        }),
      });

      if (!res.ok) {
        setError('Something went wrong. Please try again.');
        return;
      }

      const json = await res.json();

      if (json.errors?.length) {
        const gqlError = json.errors[0];
        const code = gqlError?.extensions?.code;
        if (code === 'FORBIDDEN') {
          setError('Invalid invite code.');
        } else if (code === 'BAD_USER_INPUT') {
          setError(gqlError.message);
        } else {
          setError('Something went wrong. Please try again.');
        }
        return;
      }

      const token = json.data?.register?.token;
      if (!token) {
        setError('Something went wrong. Please try again.');
        return;
      }

      await storeAuthToken(token);
      onRegister();
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
            <label htmlFor="name" className="block text-label-md font-medium text-fg-muted mb-1">
              Name
            </label>
            <input
              id="name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-edge-subtle bg-surface-raised px-3 py-2 text-body-sm text-fg placeholder-fg-faint focus:border-edge-subtle focus:outline-none focus:ring-1 focus:ring-edge-subtle"
              placeholder="Your name"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-label-md font-medium text-fg-muted mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-edge-subtle bg-surface-raised px-3 py-2 text-body-sm text-fg placeholder-fg-faint focus:border-edge-subtle focus:outline-none focus:ring-1 focus:ring-edge-subtle"
              placeholder="Min. 8 characters"
            />
          </div>
          <div>
            <label
              htmlFor="inviteCode"
              className="block text-label-md font-medium text-fg-muted mb-1"
            >
              Invite Code
            </label>
            <input
              id="inviteCode"
              type="password"
              required
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="w-full rounded border border-edge-subtle bg-surface-raised px-3 py-2 text-body-sm text-fg placeholder-fg-faint focus:border-edge-subtle focus:outline-none focus:ring-1 focus:ring-edge-subtle"
              placeholder="Enter your invite code"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-accent px-4 py-2 text-label-md font-medium text-on-accent hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-edge-subtle focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-center text-body-sm text-fg-faint">
          Already have an account?{' '}
          <button type="button" onClick={onBack} className="text-fg-muted hover:text-fg">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
