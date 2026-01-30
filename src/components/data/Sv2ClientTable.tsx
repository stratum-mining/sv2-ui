import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatHashrate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { ClientMetadata } from '@/types/api';

interface Sv2ClientTableProps {
  clients: ClientMetadata[];
  isLoading?: boolean;
  onClientClick?: (clientId: number) => void;
}

/**
 * Table component for displaying SV2 clients connected to JDC or Pool.
 * Matches Replit UI styling - rounded-xl, glass effect.
 */
export function Sv2ClientTable({ clients, isLoading, onClientClick }: Sv2ClientTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden shadow-sm">
        <div className="p-8 text-center text-muted-foreground">
          Loading clients...
        </div>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden shadow-sm">
        <div className="p-8 text-center text-muted-foreground">
          No SV2 clients connected
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden shadow-sm">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow className="hover:bg-transparent border-border/40">
            <TableHead className="w-[80px]">Client ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Hashrate</TableHead>
            <TableHead className="text-right hidden md:table-cell">Extended Channels</TableHead>
            <TableHead className="text-right hidden lg:table-cell">Standard Channels</TableHead>
            <TableHead className="text-right">Total Channels</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => {
            const totalChannels = client.extended_channels_count + client.standard_channels_count;
            const hasChannels = totalChannels > 0;
            
            return (
              <TableRow 
                key={client.client_id} 
                className={cn(
                  "hover:bg-muted/20 border-border/40 group",
                  onClientClick && "cursor-pointer"
                )}
                onClick={() => onClientClick?.(client.client_id)}
              >
                <TableCell className="font-mono text-xs">
                  {client.client_id}
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <div className={cn(
                      "h-2.5 w-2.5 rounded-full shadow-sm",
                      hasChannels ? "bg-green-500" : "bg-yellow-500"
                    )} />
                    <span className="text-sm text-muted-foreground">
                      {hasChannels ? 'Active' : 'Connecting'}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {formatHashrate(client.total_hashrate)}
                </TableCell>
                <TableCell className="text-right font-mono hidden md:table-cell text-muted-foreground">
                  {client.extended_channels_count}
                </TableCell>
                <TableCell className="text-right font-mono hidden lg:table-cell text-muted-foreground">
                  {client.standard_channels_count}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {totalChannels}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
