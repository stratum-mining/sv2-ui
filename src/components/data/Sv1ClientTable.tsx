import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatHashrate, truncateHex } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Sv1ClientInfo } from '@/types/api';

interface Sv1ClientTableProps {
  clients: Sv1ClientInfo[];
  isLoading?: boolean;
}

/**
 * Table component for displaying SV1 clients connected to Translator.
 * SV1 clients are legacy mining hardware using Stratum V1 protocol.
 * Matches Replit UI styling - rounded-xl, glass effect, border-border/40.
 */
export function Sv1ClientTable({ clients, isLoading }: Sv1ClientTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden shadow-sm">
        <div className="p-8 text-center text-muted-foreground">
          Loading SV1 clients...
        </div>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden shadow-sm">
        <div className="p-8 text-center text-muted-foreground">
          No SV1 clients connected
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden shadow-sm">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow className="hover:bg-transparent border-border/40">
            <TableHead className="w-[80px]">ID</TableHead>
            <TableHead>Worker Name</TableHead>
            <TableHead>User Identity</TableHead>
            <TableHead className="text-right">Hashrate</TableHead>
            <TableHead className="hidden md:table-cell">Channel</TableHead>
            <TableHead className="hidden lg:table-cell">Extranonce1</TableHead>
            <TableHead className="hidden xl:table-cell">Version Rolling</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow key={client.client_id} className="hover:bg-muted/20 border-border/40 group">
              <TableCell className="font-mono text-xs text-muted-foreground">
                {client.client_id}
              </TableCell>
              <TableCell className="font-medium">
                <div className="flex items-center space-x-2">
                  <div className={cn(
                    "h-2.5 w-2.5 rounded-full shadow-sm",
                    client.hashrate !== null ? "bg-green-500" : "bg-muted-foreground"
                  )} />
                  <span>{client.authorized_worker_name || '-'}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {client.user_identity || '-'}
              </TableCell>
              <TableCell className="text-right font-mono">
                {client.hashrate !== null ? formatHashrate(client.hashrate) : '-'}
              </TableCell>
              <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                {client.channel_id !== null ? client.channel_id : '-'}
              </TableCell>
              <TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground">
                {truncateHex(client.extranonce1_hex, 4)}
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                {client.version_rolling_mask ? (
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-green-500/10 text-green-500 border-green-500/20">
                    {truncateHex(client.version_rolling_mask, 4)}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-muted text-muted-foreground border-border">
                    Disabled
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
