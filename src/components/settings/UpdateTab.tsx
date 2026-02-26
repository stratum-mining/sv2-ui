import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

type UpdateState = 'idle' | 'updating' | 'done_ok' | 'done_err';

export function UpdateTab({ container }: { container: 'tproxy' | 'jd_client' }) {
  const [state, setState] = useState<UpdateState>('idle');
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState('');
  const logRef = useRef<HTMLPreElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const handleUpdate = () => {
    if (esRef.current) {
      esRef.current.close();
    }
    setState('updating');
    setLines([]);
    setError('');

    const es = new EventSource(`/api/update?container=${container}`);
    esRef.current = es;

    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type: string; message?: string; ok?: boolean; error?: string };

        if (msg.type === 'progress' && msg.message) {
          setLines((prev) => {
            const next = [...prev, msg.message!];
            // auto-scroll
            requestAnimationFrame(() => {
              if (logRef.current) {
                logRef.current.scrollTop = logRef.current.scrollHeight;
              }
            });
            return next;
          });
        } else if (msg.type === 'done') {
          es.close();
          esRef.current = null;
          if (msg.ok) {
            setState('done_ok');
          } else {
            setError(msg.error ?? 'Unknown error');
            setState('done_err');
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setError('Connection to server lost.');
      setState('done_err');
    };
  };

  const label = container === 'tproxy' ? 'Translator Proxy' : 'JD Client';

  return (
    <Card className="glass-card border-none shadow-md bg-card/40">
      <CardHeader>
        <CardTitle>Update {label}</CardTitle>
        <CardDescription>
          Pull the latest Docker image and restart the container with the same configuration.
          The container will be briefly unavailable during the update.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleUpdate}
          disabled={state === 'updating'}
          className="flex items-center gap-2"
        >
          {state === 'updating' && <RefreshCw className="h-4 w-4 animate-spin" />}
          {state === 'updating' ? 'Updating…' : 'Pull latest & restart'}
        </Button>

        {(state === 'updating' || lines.length > 0) && (
          <pre
            ref={logRef}
            className="text-xs font-mono bg-black/80 text-green-400 p-3 rounded-md overflow-auto max-h-72 whitespace-pre-wrap"
          >
            {lines.join('\n')}
            {state === 'updating' && <span className="animate-pulse">▌</span>}
          </pre>
        )}

        {state === 'done_ok' && (
          <p className="flex items-center gap-1.5 text-sm text-green-500">
            <CheckCircle2 className="h-4 w-4" />
            Update complete — container is running the latest image.
          </p>
        )}

        {state === 'done_err' && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <XCircle className="h-4 w-4" />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
