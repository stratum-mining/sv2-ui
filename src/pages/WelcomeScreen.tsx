import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { 
  Wand2, 
  Server, 
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import { getEndpointConfig } from '@/hooks/usePoolData';

interface WelcomeScreenProps {
  onRefresh: () => void;
  isLoading: boolean;
}

/**
 * Full-page welcome screen shown when no services are detected.
 * Clean design matching stratumprotocol.org styling.
 */
export function WelcomeScreen({ onRefresh, isLoading }: WelcomeScreenProps) {
  const [, setLocation] = useLocation();
  const [showConnectionHelp, setShowConnectionHelp] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const endpoints = getEndpointConfig();

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header with logo */}
      <header className="border-b border-border/50 px-6 py-4">
        <img
          src="/sv2-logo-240x40.png"
          srcSet="/sv2-logo-240x40.png 1x, /sv2-logo.png 2x"
          alt="Stratum V2"
          className="h-8 w-auto"
        />
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full text-center space-y-8">
          {/* Hero */}
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              SV2 Mining Stack
            </h1>
            <p className="text-xl text-muted-foreground max-w-lg mx-auto">
              Monitor your Stratum V2 mining infrastructure in real-time.
            </p>
          </div>

          {/* Status indicator */}
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <div className={`h-2 w-2 rounded-full ${isLoading ? 'bg-sv2-yellow animate-pulse' : 'bg-sv2-red'}`} />
            <span className="text-sm">
              {isLoading ? 'Checking for services...' : 'No services detected'}
            </span>
          </div>

          {/* Action cards */}
          {!showConnectionHelp ? (
            <div className="grid gap-4 md:grid-cols-2 max-w-xl mx-auto">
              {/* Option 1: Already have services */}
              <button
                onClick={() => setShowConnectionHelp(true)}
                className="group p-6 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-card/80 transition-all text-left"
              >
                <Server className="h-8 w-8 text-primary mb-4" />
                <h3 className="font-semibold mb-2">I have Translator or JDC running</h3>
                <p className="text-sm text-muted-foreground">
                  Connect to existing services on this machine or network.
                </p>
                <div className="mt-4 text-primary text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                  Connect <ArrowRight className="h-4 w-4" />
                </div>
              </button>

              {/* Option 2: Need to set up */}
              <button
                onClick={() => setLocation('/setup')}
                className="group p-6 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-card/80 transition-all text-left"
              >
                <Wand2 className="h-8 w-8 text-primary mb-4" />
                <h3 className="font-semibold mb-2">I need to set up SV2</h3>
                <p className="text-sm text-muted-foreground">
                  Use the deployment wizard to configure and start your stack.
                </p>
                <div className="mt-4 text-primary text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                  Launch Wizard <ArrowRight className="h-4 w-4" />
                </div>
              </button>
            </div>
          ) : (
            /* Connection help panel */
            <div className="max-w-xl mx-auto space-y-6 text-left">
              <div className="p-6 rounded-xl border border-border bg-card">
                <h3 className="font-semibold mb-4">Connect to your services</h3>
                
                {/* Current endpoints being checked */}
                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">Translator Proxy</p>
                      <p className="text-xs text-muted-foreground font-mono">{endpoints.translator.base}</p>
                    </div>
                    <div className="h-2 w-2 rounded-full bg-sv2-red" />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">Job Declarator Client</p>
                      <p className="text-xs text-muted-foreground font-mono">{endpoints.jdc.base}</p>
                    </div>
                    <div className="h-2 w-2 rounded-full bg-neutral-400" />
                  </div>
                </div>

                {/* Instructions */}
                <div className="space-y-4 text-sm">
                  <p className="text-muted-foreground">
                    Make sure your services are running with <strong>monitoring enabled</strong>:
                  </p>
                  
                  <div className="space-y-2">
                    <CodeLine 
                      code="./translator-proxy --monitoring-address 0.0.0.0:9092"
                      onCopy={() => copyToClipboard('./translator-proxy --monitoring-address 0.0.0.0:9092', 'translator')}
                      copied={copied === 'translator'}
                    />
                    <CodeLine 
                      code="./jdc --monitoring-address 0.0.0.0:9091"
                      onCopy={() => copyToClipboard('./jdc --monitoring-address 0.0.0.0:9091', 'jdc')}
                      copied={copied === 'jdc'}
                    />
                  </div>

                  <p className="text-muted-foreground pt-2">
                    <strong>Remote services?</strong> Add URL parameters:
                  </p>
                  <CodeLine 
                    code={`${window.location.origin}/?translator_url=http://IP:9092`}
                    onCopy={() => copyToClipboard(`${window.location.origin}/?translator_url=http://IP:9092&jdc_url=http://IP:9091`, 'remote')}
                    copied={copied === 'remote'}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                  <Button onClick={onRefresh} className="flex-1 gap-2">
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Check Connection
                  </Button>
                  <Button variant="outline" onClick={() => setShowConnectionHelp(false)}>
                    Back
                  </Button>
                </div>
              </div>

              {/* Alternative */}
              <p className="text-center text-sm text-muted-foreground">
                Don't have the binaries?{' '}
                <button 
                  onClick={() => setLocation('/setup')}
                  className="text-primary hover:underline font-medium"
                >
                  Use the deployment wizard
                </button>
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 px-6 py-4 text-center text-sm text-muted-foreground">
        <a 
          href="https://stratumprotocol.org" 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          stratumprotocol.org
        </a>
      </footer>
    </div>
  );
}

function CodeLine({ 
  code, 
  onCopy, 
  copied 
}: { 
  code: string; 
  onCopy: () => void; 
  copied: boolean;
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-muted font-mono text-xs">
      <code className="flex-1 text-foreground break-all">{code}</code>
      <button 
        onClick={onCopy}
        className="p-1 hover:bg-background/50 rounded transition-colors flex-shrink-0"
      >
        {copied ? (
          <CheckCircle2 className="h-4 w-4 text-sv2-green" />
        ) : (
          <Copy className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}
