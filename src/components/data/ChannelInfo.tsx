import { Badge } from '@/components/ui/badge';
import { formatHashrate, formatDifficulty, truncateHex, formatNumber } from '@/lib/utils';
import type {
  ServerExtendedChannelInfo,
  ServerStandardChannelInfo,
  ExtendedChannelInfo,
  StandardChannelInfo,
} from '@/types/api';

interface ChannelInfoProps {
  channel: ServerExtendedChannelInfo | ServerStandardChannelInfo | ExtendedChannelInfo | StandardChannelInfo;
  /** Context of the channel - 'server' for upstream channels, 'client' for downstream */
  type?: 'server' | 'client';
}

/**
 * Displays detailed information about a single channel.
 * Used in expanded views and detail panels.
 */
export function ChannelInfo({ channel, type: _type }: ChannelInfoProps) {
  const isExtended = 'full_extranonce_size' in channel;
  const hasSharesPerMinute = 'shares_per_minute' in channel;
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
      <InfoItem label="Channel ID" value={channel.channel_id} mono />
      <InfoItem label="User Identity" value={channel.user_identity || '-'} />
      <InfoItem 
        label="Hashrate" 
        value={formatHashrate(channel.nominal_hashrate)} 
        highlight 
      />
      <InfoItem 
        label="Best Diff" 
        value={formatDifficulty(channel.best_diff)} 
      />
      <InfoItem 
        label="Shares Accepted" 
        value={formatNumber(channel.shares_accepted)} 
      />
      {hasSharesPerMinute && (
        <InfoItem 
          label="Shares/min" 
          value={(channel as ExtendedChannelInfo).shares_per_minute.toFixed(2)} 
        />
      )}
      <InfoItem 
        label="Target" 
        value={truncateHex(channel.target_hex, 8)} 
        mono 
      />
      <InfoItem 
        label="Extranonce" 
        value={truncateHex(channel.extranonce_prefix_hex, 6)} 
        mono 
      />
      {isExtended && (
        <>
          <InfoItem 
            label="Extranonce Size" 
            value={`${(channel as ServerExtendedChannelInfo | ExtendedChannelInfo).full_extranonce_size} bytes`} 
          />
          <InfoItem 
            label="Rollable" 
            value={`${(channel as ServerExtendedChannelInfo | ExtendedChannelInfo).rollable_extranonce_size} bytes`} 
          />
        </>
      )}
      {'version_rolling' in channel && (
        <InfoItem 
          label="Version Rolling" 
          value={
            <Badge variant={(channel as ServerExtendedChannelInfo).version_rolling ? 'success' : 'secondary'}>
              {(channel as ServerExtendedChannelInfo).version_rolling ? 'Enabled' : 'Disabled'}
            </Badge>
          } 
        />
      )}
    </div>
  );
}

interface InfoItemProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  highlight?: boolean;
}

function InfoItem({ label, value, mono, highlight }: InfoItemProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm ${mono ? 'font-mono' : ''} ${highlight ? 'text-primary font-semibold' : ''}`}>
        {value}
      </p>
    </div>
  );
}
