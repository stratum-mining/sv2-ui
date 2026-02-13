import { Switch, Route } from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { HashrateHistoryProvider } from '@/context/HashrateHistoryContext';
import { UnifiedDashboard } from '@/pages/UnifiedDashboard';
import { PoolStats } from '@/pages/PoolStats';
import { Settings } from '@/pages/Settings';
import { SetupWizard } from '@/pages/SetupWizard';

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
 */
function Router() {
  return (
    <Switch>
      <Route path="/">
        <UnifiedDashboard />
      </Route>
      <Route path="/pool-stats">
        <PoolStats />
      </Route>
      <Route path="/settings">
        <Settings appMode="translator" />
      </Route>
      <Route path="/setup">
        <SetupWizard />
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
      <HashrateHistoryProvider>
        <Router />
      </HashrateHistoryProvider>
    </QueryClientProvider>
  );
}

export default App;
