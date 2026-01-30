import { cn } from '@/lib/utils';

type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error';

interface ConnectionStatusProps {
  state: ConnectionState;
  label?: string;
  className?: string;
}

/**
 * A visual indicator for connection status.
 * Shows a colored dot with optional label.
 */
export function ConnectionStatus({
  state,
  label,
  className,
}: ConnectionStatusProps) {
  const stateConfig: Record<ConnectionState, { color: string; text: string }> = {
    connected: { color: 'bg-green-500', text: 'Connected' },
    connecting: { color: 'bg-yellow-500 animate-pulse', text: 'Connecting' },
    disconnected: { color: 'bg-muted-foreground', text: 'Disconnected' },
    error: { color: 'bg-red-500', text: 'Error' },
  };

  const config = stateConfig[state];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'h-2 w-2 rounded-full shadow-sm',
          config.color
        )}
      />
      <span className="text-sm text-muted-foreground">
        {label || config.text}
      </span>
    </div>
  );
}

/**
 * Determines connection state based on health check response.
 */
export function getConnectionState(
  isLoading: boolean,
  isError: boolean,
  isSuccess: boolean
): ConnectionState {
  if (isLoading) return 'connecting';
  if (isError) return 'error';
  if (isSuccess) return 'connected';
  return 'disconnected';
}
