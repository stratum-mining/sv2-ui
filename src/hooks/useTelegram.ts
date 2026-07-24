import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type TelegramSettings = {
  connected: boolean;
  paired: boolean;
  botUsername: string | null;
  botName: string | null;
  recipient: string | null;
  pairingUrl: string | null;
  enabled: boolean;
  notifyOnStatusChange: boolean;
  summaryIntervalMinutes: number;
};

export type TelegramSettingsUpdate = {
  enabled?: boolean;
  notifyOnStatusChange?: boolean;
  summaryIntervalMinutes?: number;
};

type SuccessResponse = {
  success: true;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data as T;
}

async function fetchSettings(): Promise<TelegramSettings> {
  return parseResponse(await fetch('/api/telegram'));
}

async function connectBot(botToken: string): Promise<TelegramSettings> {
  return parseResponse(await fetch('/api/telegram/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botToken }),
  }));
}

async function pairChat(): Promise<TelegramSettings> {
  return parseResponse(await fetch('/api/telegram/pair', {
    method: 'POST',
  }));
}

async function updateSettings(update: TelegramSettingsUpdate): Promise<TelegramSettings> {
  return parseResponse(await fetch('/api/telegram', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  }));
}

async function sendTestMessage(): Promise<SuccessResponse> {
  return parseResponse(await fetch('/api/telegram/test', {
    method: 'POST',
  }));
}

async function disconnectBot(): Promise<TelegramSettings> {
  return parseResponse(await fetch('/api/telegram', {
    method: 'DELETE',
  }));
}

export function useTelegram() {
  const queryClient = useQueryClient();
  const queryKey = ['telegram-settings'];

  const settingsQuery = useQuery({
    queryKey,
    queryFn: fetchSettings,
    retry: false,
  });

  const updateCachedSettings = (settings: TelegramSettings) => {
    queryClient.setQueryData(queryKey, settings);
  };

  const connectMutation = useMutation({
    mutationFn: connectBot,
    onSuccess: updateCachedSettings,
  });
  const pairMutation = useMutation({
    mutationFn: pairChat,
    onSuccess: updateCachedSettings,
  });
  const settingsMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: updateCachedSettings,
  });
  const testMutation = useMutation({
    mutationFn: sendTestMessage,
  });
  const disconnectMutation = useMutation({
    mutationFn: disconnectBot,
    onSuccess: updateCachedSettings,
  });

  const error =
    connectMutation.error ??
    pairMutation.error ??
    settingsMutation.error ??
    testMutation.error ??
    disconnectMutation.error ??
    settingsQuery.error;

  const clearError = () => {
    connectMutation.reset();
    pairMutation.reset();
    settingsMutation.reset();
    testMutation.reset();
    disconnectMutation.reset();
  };

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    isPending:
      connectMutation.isPending ||
      pairMutation.isPending ||
      settingsMutation.isPending ||
      testMutation.isPending ||
      disconnectMutation.isPending,
    error: error instanceof Error ? error.message : null,
    testSent: testMutation.isSuccess,
    connect: connectMutation.mutateAsync,
    pair: pairMutation.mutateAsync,
    update: settingsMutation.mutateAsync,
    sendTest: testMutation.mutateAsync,
    disconnect: disconnectMutation.mutateAsync,
    clearError,
  };
}
