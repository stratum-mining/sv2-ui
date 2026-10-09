import type { Sv2ClientWithChannels } from '@/hooks/usePoolData';
import type { ServerChannelsResponse } from '@/types/api';

export type TileChannelMetric = 'blocks_found' | 'best_diff';

export interface TileMetricEntry {
  key: string;
  value: number;
}

interface TileMetricSources {
  isJdMode: boolean;
  jdcClients: Sv2ClientWithChannels[] | undefined;
  translatorServerChannels: ServerChannelsResponse | undefined;
}

/**
 * Per-channel entries behind the Blocks Found and Best Difficulty tiles.
 *
 * In JD mode they come from every SV2 client connected to JDC, the
 * translator_proxy client included: JDC validates each share against its own
 * templates and submits block solutions to the Template Provider, and the SV1
 * miners' shares reach it through translator_proxy, so its channels cover every
 * miner exactly once. JDC's upstream channel is not a source, because it does
 * not exist in solo mode and only validates shares for custom jobs the pool has
 * already acknowledged.
 *
 * In Translator-only mode they come from the translator's upstream channels.
 */
export function tileMetricEntries(
  { isJdMode, jdcClients, translatorServerChannels }: TileMetricSources,
  metric: TileChannelMetric,
): TileMetricEntry[] {
  if (isJdMode) {
    if (!jdcClients) return [];

    return jdcClients.flatMap((client) => [
      ...client.extended_channels.map((channel) => ({
        key: `jdc:${client.client_id}:extended:${channel.channel_id}:${channel.user_identity}`,
        value: channel[metric],
      })),
      ...client.standard_channels.map((channel) => ({
        key: `jdc:${client.client_id}:standard:${channel.channel_id}:${channel.user_identity}`,
        value: channel[metric],
      })),
    ]);
  }

  if (!translatorServerChannels) return [];

  return [
    ...translatorServerChannels.extended_channels.map((channel) => ({
      key: `translator:server:extended:${channel.channel_id}:${channel.user_identity}`,
      value: channel[metric],
    })),
    ...translatorServerChannels.standard_channels.map((channel) => ({
      key: `translator:server:standard:${channel.channel_id}:${channel.user_identity}`,
      value: channel[metric],
    })),
  ];
}
