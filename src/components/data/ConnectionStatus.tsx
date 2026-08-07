import { cn } from '@/lib/utils';
import { StatusDot } from '@/components/ui/status-dot';

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
  const stateConfig: Record<ConnectionState, { status: 'connected' | 'connecting' | 'disconnected' | 'idle'; text: string }> = {
    connected: { status: 'connected', text: 'Connected' },
    connecting: { status: 'connecting', text: 'Connecting' },
    disconnected: { status: 'idle', text: 'Disconnected' },
    error: { status: 'disconnected', text: 'Error' },
  };

  const config = stateConfig[state];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <StatusDot status={config.status} size="sm" className="shadow-sm" />
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
