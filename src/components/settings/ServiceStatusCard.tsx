import { CheckCircle2, XCircle } from 'lucide-react';

interface ServiceStatusCardProps {
  name: string;
  address: string;
  isLoading: boolean;
  isOk: boolean | undefined;
  notRunningLabel?: string;
}

export function ServiceStatusCard({
  name,
  address,
  isLoading,
  isOk,
  notRunningLabel,
}: ServiceStatusCardProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-muted/20">
      <div className="flex items-center gap-3">
        <div className={`h-3 w-3 rounded-full ${
          isLoading ? 'bg-yellow-500 animate-pulse' :
          isOk ? 'bg-green-500' : (notRunningLabel ? 'bg-neutral-400' : 'bg-red-500')
        }`} />
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-xs text-muted-foreground font-mono">{address}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isLoading ? (
          <span className="text-xs text-muted-foreground">Checking...</span>
        ) : isOk ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : notRunningLabel ? (
          <span className="text-xs text-muted-foreground">{notRunningLabel}</span>
        ) : (
          <XCircle className="h-5 w-5 text-red-500" />
        )}
      </div>
    </div>
  );
}
