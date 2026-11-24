import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { BitcoinRpcDiscoveryResult } from '@/hooks/useBitcoinRpcDiscovery';
import { BitcoinPrereqStep } from './BitcoinPrereqStep';
import { initialSetupData, type SetupData } from '../types';

const data: SetupData = {
  ...initialSetupData,
  mode: 'jd',
  bitcoin: {
    core_version: '31',
    network: 'mainnet',
    os: 'linux',
    customDataDir: '',
    socket_path: '~/.bitcoin/node.sock',
  },
};

const nodes: BitcoinRpcDiscoveryResult[] = [
  {
    valid: true,
    dataDir: '~/.bitcoin',
    network: 'mainnet',
    chain: 'main',
    version: 310000,
    initialBlockDownload: false,
  },
  {
    valid: true,
    dataDir: '~/.bitcoin',
    network: 'regtest',
    chain: 'regtest',
    version: 310000,
    initialBlockDownload: true,
  },
];

function render(discoveredNodes: BitcoinRpcDiscoveryResult[]) {
  return renderToStaticMarkup(
    <BitcoinPrereqStep
      data={data}
      updateData={() => {}}
      onNext={() => {}}
      onBack={() => {}}
      discoveredNodes={discoveredNodes}
      isDiscovering={false}
      onRetryDiscovery={() => {}}
      onAutoAdvance={() => {}}
    />,
  );
}

test('a syncing regtest node does not make a mainnet setup look stuck', () => {
  const html = render(nodes);
  assert.doesNotMatch(html, /Bitcoin Core is syncing/);
  assert.match(html, /Bitcoin Core detected/);
});
