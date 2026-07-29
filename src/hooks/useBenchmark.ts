import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  BenchmarkRun,
  BenchmarkStartRequest,
  BenchmarkStatusResponse,
  SetupData,
} from '@sv2-ui/shared';

type ConfigResponse = {
  configured: boolean;
  config: SetupData | null;
};

type BenchmarkMutationResponse = {
  success: boolean;
  run?: BenchmarkRun;
  error?: string;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & {
    success?: boolean;
    error?: string;
    message?: string;
  };

  if (!response.ok || data.success === false) {
    throw new Error(data.error || data.message || `Request failed (${response.status})`);
  }

  return data;
}

async function fetchBenchmarkStatus(): Promise<BenchmarkStatusResponse> {
  const response = await fetch('/api/benchmark', {
    signal: AbortSignal.timeout(5_000),
  });
  return parseResponse<BenchmarkStatusResponse>(response);
}

async function fetchCurrentConfig(): Promise<ConfigResponse> {
  const response = await fetch('/api/config', {
    signal: AbortSignal.timeout(5_000),
  });
  return parseResponse<ConfigResponse>(response);
}

async function startBenchmark(
  request: BenchmarkStartRequest
): Promise<BenchmarkMutationResponse> {
  const response = await fetch('/api/benchmark/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(300_000),
  });
  return parseResponse<BenchmarkMutationResponse>(response);
}

async function stopBenchmark(): Promise<BenchmarkMutationResponse> {
  const response = await fetch('/api/benchmark/stop', {
    method: 'POST',
  });
  return parseResponse<BenchmarkMutationResponse>(response);
}

async function startMiningWithPool(
  pool: { address: string; port: number }
): Promise<BenchmarkMutationResponse> {
  const response = await fetch('/api/benchmark/mine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pool),
    signal: AbortSignal.timeout(300_000),
  });
  return parseResponse<BenchmarkMutationResponse>(response);
}

export function useBenchmark() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ['benchmark'],
    queryFn: fetchBenchmarkStatus,
    refetchInterval: 2_000,
    retry: false,
  });
  const configQuery = useQuery({
    queryKey: ['current-config'],
    queryFn: fetchCurrentConfig,
    staleTime: 5_000,
    retry: false,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['benchmark'] });
    queryClient.invalidateQueries({ queryKey: ['setup-status'] });
    queryClient.invalidateQueries({ queryKey: ['current-config'] });
  };

  const startMutation = useMutation({
    mutationFn: startBenchmark,
    onSuccess: invalidate,
  });
  const stopMutation = useMutation({
    mutationFn: stopBenchmark,
    onSuccess: invalidate,
  });
  const mineMutation = useMutation({
    mutationFn: startMiningWithPool,
    onSuccess: invalidate,
  });

  return {
    run: statusQuery.data?.run ?? null,
    config: configQuery.data?.config ?? null,
    isLoading: statusQuery.isLoading || configQuery.isLoading,
    statusError: statusQuery.error ?? configQuery.error,
    start: startMutation.mutateAsync,
    stop: stopMutation.mutateAsync,
    startMining: mineMutation.mutateAsync,
    isStarting: startMutation.isPending,
    isStopping: stopMutation.isPending,
    isStartingMining: mineMutation.isPending,
    actionError: startMutation.error ?? stopMutation.error ?? mineMutation.error,
  };
}
