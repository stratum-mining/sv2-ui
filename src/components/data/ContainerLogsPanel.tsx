import { useEffect, useRef, useCallback } from 'react';
import { Download } from 'lucide-react';
import type { ContainerLogLine } from '@/types/log-diagnostics';
import { cn } from '@/lib/utils';

// Full retained history is exported by a dedicated server endpoint that
// streams formatted text with a hard byte cap, so the browser never
// materializes a JSON object graph of the whole log history.
export const LOG_DOWNLOAD_PATH = '/api/logs/download';

interface ContainerLogsPanelProps {
  lines: ContainerLogLine[];
  isLoading: boolean;
  isJdMode: boolean;
}

function getLogColorClass(line: ContainerLogLine) {
  if (line.stream === 'stderr') return 'text-red-400';
  const msg = line.message.toUpperCase();
  if (msg.includes('ERROR ') || msg.includes('FATAL ') || msg.includes('EXCEPTION') || msg.includes('LEVEL=ERROR')) {
    return 'text-red-400';
  }
  if (msg.includes('WARN ') || msg.includes('LEVEL=WARN')) {
    return 'text-yellow-400';
  }
  return 'text-green-300/90';
}

export function ContainerLogsPanel({ lines, isLoading, isJdMode }: ContainerLogsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    userScrolledUp.current = !atBottom;
  };

  // Auto-scroll to bottom when new lines arrive unless the user scrolled up
  useEffect(() => {
    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines]);

  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(LOG_DOWNLOAD_PATH, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) return;
      // The streamed body is the only copy: no JSON parse, no object array,
      // no re-joined string — just the file itself.
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sv2-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch {
      // download failed silently
    }
  }, []);

  if (isLoading && lines.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center rounded-md bg-black/80 text-zinc-500 text-xs font-mono">
        Loading logs…
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center rounded-md bg-black/80 text-zinc-500 text-xs font-mono">
        No log output yet. Services may not be running.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex justify-end">
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          title="Download logs as .txt"
        >
          <Download className="h-3.5 w-3.5" />
          Download logs
        </button>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-72 overflow-y-auto rounded-md bg-black/80 p-3 font-mono text-xs leading-relaxed"
      >
        {lines.map((line, i) => (
          <div
            key={`${line.container}-${line.timestamp ?? ''}-${i}`}
            className={cn(
              'flex gap-2 min-w-0 py-px',
              getLogColorClass(line)
            )}
          >
            {line.timestamp && (
              <span className="shrink-0 text-zinc-500 select-none">
                {new Date(line.timestamp).toLocaleTimeString()}
              </span>
            )}
            {isJdMode && (
              <span
                className={cn(
                  'shrink-0 rounded px-1 text-[10px] font-semibold leading-[1.6] select-none',
                  line.container === 'translator'
                    ? 'bg-cyan-900/60 text-cyan-300'
                    : 'bg-purple-900/60 text-purple-300'
                )}
              >
                {line.container}
              </span>
            )}
            <span className="break-all">{line.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
