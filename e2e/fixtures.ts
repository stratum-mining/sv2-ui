import type { Page, Request, Route } from '@playwright/test';
import { test as base } from '@playwright/test';
import type { SetupStatus } from '../src/hooks/useSetupStatus';
import type { SetupData } from '../src/components/setup/types';
import type {
  GlobalInfo,
  ServerChannelsResponse,
  Sv1ClientsResponse,
  Sv2ClientChannelsResponse,
  Sv2ClientsResponse,
} from '../src/types/api';
import type {
  ContainerLogsResponse,
  LogDiagnosticsResponse,
} from '../src/types/log-diagnostics';
import {
  testDiagnostics,
  testGlobal,
  testLogs,
  testSetupData,
  testServerChannels,
  testStatus,
  testSv1Clients,
  testSv2ClientChannels,
  testSv2Clients,
} from './fixtures/api';

export type ApiScenario = {
  status?: SetupStatus;
  config?: SetupData | null;
  env?: { HOST_OS: string | null; STRATUM_HOST: string | null };
  bitcoinDiscovery?: unknown;
  bitcoinSocket?: { valid: boolean; error?: string };
  setupResponse?: { status?: number; body: { success: boolean; error?: string } };
  controlResponses?: Record<string, { status?: number; body: { success: boolean; error?: string } }>;
  translatorHealth?: boolean;
  jdcHealth?: boolean;
  translatorGlobal?: GlobalInfo;
  jdcGlobal?: GlobalInfo;
  translatorServerChannels?: ServerChannelsResponse;
  jdcServerChannels?: ServerChannelsResponse;
  translatorSv1Clients?: Sv1ClientsResponse;
  jdcSv2Clients?: Sv2ClientsResponse;
  jdcClientChannels?: Record<number, Sv2ClientChannelsResponse>;
  diagnostics?: LogDiagnosticsResponse;
  logs?: ContainerLogsResponse;
};

export type CapturedRequest = {
  method: string;
  path: string;
  body: unknown;
};

export type ApiMock = {
  requests: CapturedRequest[];
  requestsFor(path: string, method?: string): CapturedRequest[];
};

type MockApi = (scenario?: ApiScenario) => Promise<ApiMock>;

function jsonResponse(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function requestBody(request: Request): unknown {
  try {
    return request.postDataJSON();
  } catch {
    return request.postData() ?? null;
  }
}

function routePath(route: Route): string {
  return new URL(route.request().url()).pathname;
}

export async function mockApi(page: Page, scenario: ApiScenario = {}): Promise<ApiMock> {
  const requests: CapturedRequest[] = [];
  const status = scenario.status ?? {
    ...testStatus,
    configured: false,
    running: false,
    shouldBeRunning: false,
    miningMode: null,
    mode: null,
    poolName: null,
    activePoolIndex: null,
    activePoolAddress: null,
    activePoolPort: null,
    activePoolAuthorityPublicKey: null,
    containers: { translator: null, jdc: null },
  };
  const config = scenario.config === undefined
    ? (status.configured ? testSetupData : null)
    : scenario.config;
  const controlResponses = scenario.controlResponses ?? {};

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = routePath(route);
    requests.push({ method: request.method(), path, body: requestBody(request) });

    if (path === '/api/status') return jsonResponse(route, status);
    if (path === '/api/config' && request.method() === 'GET') {
      return jsonResponse(route, { configured: status.configured, config });
    }
    if (path === '/api/env') {
      return jsonResponse(route, scenario.env ?? { HOST_OS: 'linux', STRATUM_HOST: null });
    }
    if (path === '/api/validate/bitcoin-rpc') {
      return jsonResponse(route, scenario.bitcoinDiscovery ?? []);
    }
    if (path === '/api/validate/bitcoin-socket') {
      return jsonResponse(route, scenario.bitcoinSocket ?? { valid: true });
    }
    if (path === '/api/logs/diagnostics') {
      return jsonResponse(route, scenario.diagnostics ?? testDiagnostics);
    }
    if (path === '/api/logs/raw') {
      return jsonResponse(route, scenario.logs ?? testLogs);
    }

    const controlResponse = path === '/api/setup'
      ? scenario.setupResponse
      : controlResponses[path];
    if (controlResponse) {
      return jsonResponse(route, controlResponse.body, controlResponse.status ?? 200);
    }

    return jsonResponse(route, { success: true });
  });

  await page.route('**/translator-api/**', async (route) => {
    const path = routePath(route);
    if (path.endsWith('/health')) return route.fulfill({ status: scenario.translatorHealth === false ? 503 : 200 });
    if (path.endsWith('/global')) return jsonResponse(route, scenario.translatorGlobal ?? testGlobal);
    if (path.includes('/server/channels')) {
      return jsonResponse(route, scenario.translatorServerChannels ?? testServerChannels);
    }
    if (path.includes('/sv1/clients')) {
      return jsonResponse(route, scenario.translatorSv1Clients ?? testSv1Clients);
    }
    return jsonResponse(route, {});
  });

  await page.route('**/jdc-api/**', async (route) => {
    const path = routePath(route);
    if (path.endsWith('/health')) return route.fulfill({ status: scenario.jdcHealth === false ? 503 : 200 });
    if (path.endsWith('/global')) return jsonResponse(route, scenario.jdcGlobal ?? testGlobal);
    if (path.includes('/server/channels')) {
      return jsonResponse(route, scenario.jdcServerChannels ?? testServerChannels);
    }
    if (path.endsWith('/clients')) {
      return jsonResponse(route, scenario.jdcSv2Clients ?? testSv2Clients);
    }
    if (path.includes('/clients/')) {
      const clientId = Number(path.split('/clients/')[1]?.split('/')[0]);
      return jsonResponse(route, scenario.jdcClientChannels?.[clientId] ?? testSv2ClientChannels);
    }
    return jsonResponse(route, {});
  });

  return {
    requests,
    requestsFor(path, method) {
      return requests.filter((request) => request.path === path && (!method || request.method === method));
    },
  };
}

export const test = base.extend<{ mockApi: MockApi }>({
  mockApi: async ({ page }, use) => {
    const provideFixture = use;
    await provideFixture((scenario) => mockApi(page, scenario));
  },
});

export { expect } from '@playwright/test';
