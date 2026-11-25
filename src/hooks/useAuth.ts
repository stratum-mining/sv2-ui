import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { onAuthExpired } from '@/lib/auth-events';

export interface AuthState {
  passwordSet: boolean;
  authenticated: boolean;
  recoveryKeySet: boolean;
  needsSetup: boolean;
}

export const AUTH_QUERY_KEY = ['auth-state'] as const;

async function fetchAuthState(): Promise<AuthState> {
  const response = await fetch('/api/auth/state', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`Failed to load authentication state (${response.status})`);
  }
  const data = (await response.json()) as AuthState;
  return {
    passwordSet: data.passwordSet,
    authenticated: data.authenticated,
    recoveryKeySet: data.recoveryKeySet ?? false,
    needsSetup: data.needsSetup ?? false,
  };
}

interface PasswordResponse {
  success: boolean;
  recoveryKey?: string;
  error?: string;
}

async function postPassword(path: string, password: string): Promise<PasswordResponse> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = (await response.json().catch(() => ({}))) as PasswordResponse;
  if (!response.ok || data.success === false) {
    throw Object.assign(new Error(data.error || `Request failed (${response.status})`), { status: response.status });
  }
  return data;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchAuthState,
    staleTime: 5000,
    retry: false,
  });

  // When any protected endpoint returns 401, immediately re-check auth state
  // so LoginGate can transition to the login form without waiting for the
  // next scheduled refetch.
  useEffect(() => {
    return onAuthExpired(() => {
      queryClient.refetchQueries({ queryKey: AUTH_QUERY_KEY });
    });
  }, [queryClient]);

  const invalidate = () => {
    // A session change invalidates every cached view of server state.
    // queryClient.clear() removes queries AND detaches the active
    // observers, so the refetched auth-state would never reach the component.
    // invalidateQueries() refetches in place and keeps observers subscribed.
    queryClient.invalidateQueries();
  };

  const login = useMutation({
    mutationFn: async (password: string) => {
      await postPassword('/api/auth/login', password);
      invalidate();
    },
  });

  const createPassword = useMutation({
    mutationFn: async (password: string) => {
      const data = await postPassword('/api/auth/setup-password', password);
      invalidate();
      return data.recoveryKey;
    },
    // 409: the password was set elsewhere first, so switch to login.
    onError: (error) => {
      if ((error as { status?: number }).status === 409) {
        queryClient.refetchQueries({ queryKey: AUTH_QUERY_KEY });
      }
    },
  });

  const logout = useMutation({
    mutationFn: async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      invalidate();
    },
  });

  const recover = useMutation({
    mutationFn: async ({ recoveryKey, newPassword }: { recoveryKey: string; newPassword: string }) => {
      const response = await fetch('/api/auth/recover', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryKey, newPassword }),
      });
      const data = (await response.json().catch(() => ({}))) as PasswordResponse;
      if (!response.ok || data.success === false) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }
      invalidate();
      return data.recoveryKey;
    },
  });

  const changePassword = useMutation({
    mutationFn: async ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || data.success === false) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }
      invalidate();
    },
  });

  const regenerateRecoveryKey = useMutation({
    mutationFn: async (currentPassword: string) => {
      const response = await fetch('/api/auth/recovery-key/regenerate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword }),
      });
      const data = (await response.json().catch(() => ({}))) as PasswordResponse;
      if (!response.ok || !data.recoveryKey) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }
      return data.recoveryKey;
    },
  });

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    passwordSet: query.data?.passwordSet ?? false,
    authenticated: query.data?.authenticated ?? false,
    recoveryKeySet: query.data?.recoveryKeySet ?? false,
    needsSetup: query.data?.needsSetup ?? false,
    login,
    createPassword,
    logout,
    recover,
    changePassword,
    regenerateRecoveryKey,
  };
}
