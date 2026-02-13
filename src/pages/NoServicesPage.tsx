import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Wand2, RefreshCw } from 'lucide-react';

interface NoServicesPageProps {
  isLoading: boolean;
  onRefresh: () => void;
}

/**
 * Full-page display shown when no SV2 services are detected.
 * Clean, focused design matching stratumprotocol.org styling.
 * No sidebar - just the essential actions.
 */
export function NoServicesPage({ isLoading, onRefresh }: NoServicesPageProps) {
  const [, setLocation] = useLocation();

  const handleStartWizard = () => {
    setLocation('/setup');
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header with logo */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <img
            src="/sv2-logo-240x40.png"
            srcSet="/sv2-logo-240x40.png 1x, /sv2-logo.png 2x"
            alt="Stratum V2"
            className="h-8 w-auto"
            decoding="async"
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onRefresh}
            disabled={isLoading}
            className="gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Checking...' : 'Refresh'}
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-2xl w-full text-center space-y-8">
          {/* Status indicator */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-sm font-medium">
            <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            No Translator or JDC detected
          </div>

          {/* Main heading */}
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
              Stratum V2 Node
            </h1>
            <p className="text-lg text-gray-400 max-w-lg mx-auto">
              Run your Stratum V2 mining stack to start monitoring your operations.
            </p>
          </div>

          {/* Action buttons */}
          <div className="space-y-4 pt-4">
            <p className="text-sm text-gray-500">
              Already running? Click refresh above.<br />
              New to Stratum V2? Let us guide you through the setup.
            </p>
            
            <Button 
              onClick={handleStartWizard} 
              size="lg" 
              className="gap-2 text-base px-8 bg-cyan-500 hover:bg-cyan-600 text-white"
            >
              <Wand2 className="h-5 w-5" />
              Launch Setup Wizard
            </Button>
          </div>

          {/* Remote connection hint */}
          <div className="pt-8 border-t border-white/10">
            <p className="text-sm text-gray-500">
              Running on a different machine? Add URL parameters:
            </p>
            <code className="inline-block mt-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-mono text-gray-300">
              ?translator_url=http://IP:9092&jdc_url=http://IP:9091
            </code>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-sm text-gray-500">
          <span>Stratum V2 Node Dashboard</span>
          <a 
            href="https://stratumprotocol.org" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            stratumprotocol.org
          </a>
        </div>
      </footer>
    </div>
  );
}
