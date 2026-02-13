import { PoolConnectionWizard } from 'sv2-wizard';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';

/**
 * Setup Wizard page that wraps the sv2-wizard PoolConnectionWizard.
 * Guides users through the complete deployment process.
 * No sidebar - clean, focused wizard experience.
 */
export function SetupWizard() {
  const [, setLocation] = useLocation();

  const handleComplete = (finalStepId: string) => {
    console.log('Wizard completed at step:', finalStepId);
    // After wizard completes, redirect to dashboard
    // The user should now have their services running
    setLocation('/');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header with logo and back button */}
      <header className="border-b border-border/50 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <img
            src="/sv2-logo-240x40.png"
            srcSet="/sv2-logo-240x40.png 1x, /sv2-logo.png 2x"
            alt="Stratum V2"
            className="h-8 w-auto"
            decoding="async"
          />
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setLocation('/')}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      </header>

      {/* Wizard content */}
      <main className="flex-1 px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <PoolConnectionWizard 
            onComplete={handleComplete}
            className="w-full"
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <span>Stratum V2 Setup Wizard</span>
          <a 
            href="https://stratumprotocol.org" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            stratumprotocol.org
          </a>
        </div>
      </footer>
    </div>
  );
}
