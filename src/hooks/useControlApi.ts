import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SetupData } from '@/components/setup/types';

interface ControlResponse {
  success: boolean;
  error?: string;
}

/**
 * Stop all containers
 */
async function stopServices(): Promise<ControlResponse> {
  const response = await fetch('/api/stop', {
    method: 'POST',
  });
  return response.json();
}

/**
 * Restart containers with existing config
 */
async function restartServices(): Promise<ControlResponse> {
  const response = await fetch('/api/restart', {
    method: 'POST',
  });
  return response.json();
}

/**
 * Reconfigure and restart (used by setup wizard)
 */
async function setupServices(config: SetupData): Promise<ControlResponse> {
  const response = await fetch('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return response.json();
}

/**
 * Hook for controlling services (stop/restart)
 */
export function useControlApi() {
  const queryClient = useQueryClient();

  const stopMutation = useMutation({
    mutationFn: stopServices,
    onSuccess: () => {
      // Invalidate status queries
      queryClient.invalidateQueries({ queryKey: ['setup-status'] });
    },
  });

  const restartMutation = useMutation({
    mutationFn: restartServices,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup-status'] });
    },
  });

  const setupMutation = useMutation({
    mutationFn: setupServices,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup-status'] });
    },
  });

  return {
    stop: stopMutation.mutate,
    restart: restartMutation.mutate,
    setup: setupMutation.mutate,
    isStoppingOrRestarting: stopMutation.isPending || restartMutation.isPending,
    isSettingUp: setupMutation.isPending,
    stopError: stopMutation.error,
    restartError: restartMutation.error,
    setupError: setupMutation.error,
  };
}

/**
 * Get current configuration
 */
export async function getCurrentConfig(): Promise<SetupData | null> {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) return null;
    const data = await response.json();
    return data.config || null;
  } catch {
    return null;
  }
}
