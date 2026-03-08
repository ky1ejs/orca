import { useState, useEffect, useCallback } from 'react';
import { GraphQLProvider } from './graphql/provider.js';
import { NavigationProvider } from './navigation/context.js';
import { WorkspaceProvider } from './workspace/context.js';
import { PreferencesProvider } from './preferences/context.js';
import { AppShell } from './components/layout/AppShell.js';
import { LoginScreen } from './components/auth/LoginScreen.js';
import { RegisterScreen } from './components/auth/RegisterScreen.js';
import { setOnAuthError, clearCachedToken } from './graphql/client.js';

type AuthState = 'loading' | 'unauthenticated' | 'authenticated' | 'expired' | 'registering';

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [clientKey, setClientKey] = useState(0);

  useEffect(() => {
    async function checkAuth() {
      if (window.orca) {
        const token = await window.orca.auth.readToken();
        setAuthState(token ? 'authenticated' : 'unauthenticated');
      } else if (import.meta.env.VITE_AUTH_TOKEN) {
        // Browser dev mode with VITE_AUTH_TOKEN
        setAuthState('authenticated');
      } else {
        setAuthState('unauthenticated');
      }
    }
    checkAuth();
  }, []);

  useEffect(() => {
    setOnAuthError(() => {
      if (window.orca) {
        window.orca.auth.clearToken();
      }
      setAuthState('expired');
    });
  }, []);

  const handleLogin = useCallback(() => {
    clearCachedToken();
    setClientKey((k) => k + 1);
    setAuthState('authenticated');
  }, []);

  const handleLogout = useCallback(async () => {
    clearCachedToken();
    if (window.orca) {
      await window.orca.auth.clearToken();
    }
    setClientKey((k) => k + 1);
    setAuthState('unauthenticated');
  }, []);

  if (authState === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-gray-400">
        <p className="text-sm">Loading...</p>
      </div>
    );
  }

  if (authState === 'registering') {
    return (
      <RegisterScreen onRegister={handleLogin} onBack={() => setAuthState('unauthenticated')} />
    );
  }

  if (authState === 'unauthenticated' || authState === 'expired') {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onRegister={authState === 'unauthenticated' ? () => setAuthState('registering') : undefined}
        sessionExpired={authState === 'expired'}
      />
    );
  }

  return (
    <GraphQLProvider key={clientKey}>
      <PreferencesProvider>
        <WorkspaceProvider>
          <NavigationProvider>
            <AppShell onLogout={handleLogout} />
          </NavigationProvider>
        </WorkspaceProvider>
      </PreferencesProvider>
    </GraphQLProvider>
  );
}

export default App;
