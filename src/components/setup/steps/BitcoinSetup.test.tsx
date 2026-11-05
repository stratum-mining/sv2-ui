import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { BitcoinSetup } from './BitcoinSetup';
import { initialSetupData, type SetupData } from '../types';

const data: SetupData = {
  ...initialSetupData,
  mode: 'jd',
  bitcoin: { core_version: '31', network: 'mainnet', os: 'umbrel', customDataDir: '', socket_path: '~/.bitcoin/node.sock' },
};

function render() {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <BitcoinSetup data={data} updateData={() => {}} onNext={() => {}} onBack={() => {}} />
    </QueryClientProvider>,
  );
}

test('the Bitcoin step does not ask for a version, because the node is what counts', () => {
  const html = render();
  assert.doesNotMatch(html, /<select/);
  assert.doesNotMatch(html, /Select a supported version/);
});

test('Continue waits for the node, even with a version saved before', () => {
  assert.match(render(), /<button[^>]*disabled=""[^>]*>Continue<\/button>/);
});
