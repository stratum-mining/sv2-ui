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
 * Update configuration and restart (inline edit)
 */
async function updateConfigService(updates: Partial<SetupData>): Promise<ControlResponse> {
  const response = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
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
      queryClient.invalidateQueries({ queryKey: ['setup-status'] });
      queryClient.invalidateQueries({ queryKey: ['log-diagnostics'] });
    },
  });

  const restartMutation = useMutation({
    mutationFn: restartServices,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup-status'] });
      queryClient.invalidateQueries({ queryKey: ['log-diagnostics'] });
    },
  });

  const setupMutation = useMutation({
    mutationFn: setupServices,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup-status'] });
      queryClient.invalidateQueries({ queryKey: ['log-diagnostics'] });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: updateConfigService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setup-status'] });
      queryClient.invalidateQueries({ queryKey: ['log-diagnostics'] });
    },
  });

  return {
    stop: stopMutation.mutate,
    restart: restartMutation.mutate,
    setup: setupMutation.mutate,
    updateConfig: updateConfigMutation.mutate,
    isStoppingOrRestarting: stopMutation.isPending || restartMutation.isPending,
    isSettingUp: setupMutation.isPending,
    isUpdatingConfig: updateConfigMutation.isPending,
    stopError: stopMutation.error,
    restartError: restartMutation.error,
    setupError: setupMutation.error,
    updateConfigError: updateConfigMutation.error,
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
