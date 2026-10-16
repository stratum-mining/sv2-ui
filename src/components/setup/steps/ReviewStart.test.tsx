import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ReviewStart } from './ReviewStart';
import { initialSetupData, type SetupData } from '../types';

const data: SetupData = {
  ...initialSetupData,
  miningMode: 'pool',
  mode: 'jd',
  pool: { name: 'Primary pool', address: 'primary.example.com', port: 3333, authority_public_key: 'primary-key', user_identity: 'primary-account' },
  bitcoin: { core_version: '30', network: 'mainnet', os: 'linux', customDataDir: '', socket_path: '/home/user/.bitcoin/node.sock' },
  jdc: { coinbase_reward_address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', jdc_signature: 'sv2' },
  translator: { enable_vardiff: true, aggregate_channels: false, min_hashrate: 100_000_000_000_000, shares_per_minute: 6, downstream_extranonce2_size: 4 },
};

test('review edits settings in place with the same rows as Settings', () => {
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ReviewStart
        data={data}
        updateData={() => {}}
        onNext={() => {}}
        onBack={() => {}}
        onComplete={() => {}}
        onGoToStep={() => {}}
      />
    </QueryClientProvider>,
  );
  for (const row of ['block templates', 'pools', 'miner signature', 'solo fallback address', 'lowest worker hashrate', 'miner telemetry', 'advanced mining config']) {
    assert.match(html, new RegExp(`title="Edit ${row}"`), row);
  }
  assert.match(html, />Start Mining</);
});
