import { Switch, Route } from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { UnifiedDashboard } from '@/pages/UnifiedDashboard';
import { Settings } from '@/pages/Settings';
import { ConnectionDetails } from '@/pages/ConnectionDetails';
import { Setup } from '@/pages/Setup';
import { useHealthRedirect } from '@/hooks/useHealthRedirect';

/**
 * SV2 Mining Stack UI
 *
 * A unified dashboard for monitoring the SV2 mining stack.
 * Automatically detects the deployment mode:
 *
 * - Non-JD mode: Pool ← Translator ← SV1 Clients
 * - JD mode: Pool ← JDC ← Translator ← SV1 Clients
 *
 * Pool data (shares, hashrate) always comes from the right source:
 * - JDC's upstream connection (if JD mode)
 * - Translator's upstream connection (if non-JD mode)
 *
 * SV1 clients always come from Translator.
 *
 * On load:
 * - If wizard was never completed → redirect to /setup
 * - If wizard complete but no services running → redirect to /setup
 * - Otherwise → show dashboard
 */
function Router() {
  const { isDeciding } = useHealthRedirect();

  // While we determine where to send the user, show a blank background
  // to avoid any flash of the wrong page.
  if (isDeciding) {
    return <div className="fixed inset-0 bg-background" />;
  }

  return (
    <Switch>
      <Route path="/setup">
        <Setup />
      </Route>
      <Route path="/">
        <UnifiedDashboard />
      </Route>
      <Route path="/settings">
        <Settings appMode="translator" />
      </Route>
      <Route path="/connection">
        <ConnectionDetails />
      </Route>
      {/* Fallback to dashboard */}
      <Route>
        <UnifiedDashboard />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
    </QueryClientProvider>
  );
}

export default App;
