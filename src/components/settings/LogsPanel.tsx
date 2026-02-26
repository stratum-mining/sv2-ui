import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, ScrollText } from 'lucide-react';

export function LogsPanel({ container, active }: { container: string; active: boolean }) {
  const [logs, setLogs] = useState('');
  const [logsError, setLogsError] = useState('');
  const [logsCleared, setLogsCleared] = useState(false);
  const logsRef = useRef<HTMLPreElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    if (logsCleared) return;
    try {
      const r = await fetch(`/api/logs?container=${container}&tail=200`);
      const d = await r.json();
      if (r.ok) {
        setLogs(d.logs ?? '');
        setLogsError('');
      } else {
        setLogsError(d.error ?? 'Failed to fetch logs.');
      }
    } catch {
      setLogsError('Network error fetching logs.');
    }
  }, [container, logsCleared]);

  useEffect(() => {
    if (!active) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    fetchLogs();
    pollRef.current = setInterval(fetchLogs, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [active, fetchLogs]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <Card className="glass-card border-none shadow-md bg-card/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" /> Container Logs
        </CardTitle>
        <CardDescription>Live logs — auto-refreshes every 3 seconds.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLogsCleared(false);
              fetchLogs();
            }}
            className="flex items-center gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLogs('');
              setLogsCleared(true);
            }}
          >
            Clear
          </Button>
        </div>
        {logsError && <p className="text-sm text-red-500">{logsError}</p>}
        <pre
          ref={logsRef}
          className="w-full h-96 overflow-auto rounded-md bg-black/80 text-green-400 text-xs font-mono p-3 whitespace-pre-wrap break-all"
        >
          {logs || (logsCleared ? '(cleared)' : 'No logs yet…')}
        </pre>
      </CardContent>
    </Card>
  );
}
