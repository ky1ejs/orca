import { GraphQLProvider } from './graphql/provider.js';
import { NavigationProvider } from './navigation/context.js';
import { AppShell } from './components/layout/AppShell.js';

function App() {
  return (
    <GraphQLProvider>
      <NavigationProvider>
        <AppShell />
      </NavigationProvider>
    </GraphQLProvider>
  );
}

export default App;
