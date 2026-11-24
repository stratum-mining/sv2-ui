import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ALL_NETWORKS, SUPPORTED_NETWORKS } from '@sv2-ui/shared';
import { BitcoinNetworkSelector } from './BitcoinNetworkSelector';

function render(networks?: typeof ALL_NETWORKS) {
  return renderToStaticMarkup(
    <BitcoinNetworkSelector
      value="mainnet"
      onChange={() => {}}
      {...(networks ? { networks } : {})}
    />,
  );
}

test('the network selector hides regtest by default', () => {
  const html = render();
  assert.match(html, /Mainnet/);
  assert.match(html, /Testnet4/);
  assert.doesNotMatch(html, /Regtest/);
});

test('the network selector offers regtest when the caller adds it', () => {
  const html = render(ALL_NETWORKS);
  assert.match(html, /Regtest/);
});

test('the production network list does not include regtest', () => {
  assert.deepEqual(SUPPORTED_NETWORKS, ['mainnet', 'testnet4']);
});
