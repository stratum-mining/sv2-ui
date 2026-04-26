import { useQuery } from '@tanstack/react-query';

interface MinerConnectionCandidate {
  interface: string;
  address: string;
  private: boolean;
}

export interface MinerConnectionInfo {
  host: string | null;
  source: string;
  candidates: MinerConnectionCandidate[];
  translator_url: string | null;
  jdc_url: string | null;
}

async function fetchMinerConnectionInfo(): Promise<MinerConnectionInfo | null> {
  try {
    const response = await fetch('/api/miner-connection', {
      signal: AbortSignal.timeout(1500),
    });

    if (!response.ok) {
      return null;
    }

    return response.json() as Promise<MinerConnectionInfo>;
  } catch {
    return null;
  }
}

export function useMinerConnectionInfo() {
  return useQuery({
    queryKey: ['miner-connection-info'],
    queryFn: fetchMinerConnectionInfo,
    staleTime: 60_000,
    retry: false,
  });
}
