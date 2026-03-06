import { useEffect } from 'react';
import { Switch, Route, useLocation } from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { UnifiedDashboard } from '@/pages/UnifiedDashboard';
import { Settings } from '@/pages/Settings';
import { Setup } from '@/pages/Setup';
import { useSetupStatus } from '@/hooks/useSetupStatus';

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
  const [location, navigate] = useLocation();
  const { isLoading, isOrchestrated, needsSetup } = useSetupStatus();

  // Redirect to setup if needed (only when orchestration backend is present)
  useEffect(() => {
    if (!isLoading && isOrchestrated && needsSetup && location !== '/setup') {
      navigate('/setup');
    }
  }, [isLoading, isOrchestrated, needsSetup, location, navigate]);

  // Brief loading state while checking setup status (max ~2s due to timeout)
  // Don't block for too long - if backend is unavailable, just show the app
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="h-8 w-8 mx-auto rounded-lg bg-primary animate-pulse flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">SV2</span>
          </div>
          <p className="text-sm text-muted-foreground">Checking configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/">
        <UnifiedDashboard />
      </Route>
      <Route path="/setup">
        <Setup />
      </Route>
      <Route path="/settings">
        <Settings />
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
