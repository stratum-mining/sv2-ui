import { useEffect, useRef, useCallback } from 'react';
import { Download } from 'lucide-react';
import type { ContainerLogLine } from '@/types/log-diagnostics';
import { cn } from '@/lib/utils';

interface ContainerLogsPanelProps {
  lines: ContainerLogLine[];
  isLoading: boolean;
  isJdMode: boolean;
}

function buildDownloadContent(lines: ContainerLogLine[]): string {
  return lines
    .map((line) => {
      const parts: string[] = [];
      if (line.timestamp) parts.push(line.timestamp);
      parts.push(`[${line.container}]`);
      parts.push(`[${line.stream}]`);
      parts.push(line.message);
      return parts.join(' ');
    })
    .join('\n');
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
      const response = await fetch('/api/logs/raw?tail=all', {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return;
      const data = await response.json() as { lines: ContainerLogLine[] };
      const content = buildDownloadContent(data.lines);
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
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
              line.stream === 'stderr' ? 'text-red-400' : 'text-green-300/90'
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
