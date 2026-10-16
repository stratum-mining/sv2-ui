import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ConfigurationEditor } from './ConfigurationEditor';
import { initialSetupData, type SetupData } from '@/components/setup/types';

const config: SetupData = {
  ...initialSetupData,
  miningMode: 'pool',
  mode: 'no-jd',
  pool: { name: 'Primary pool', address: 'primary.example.com', port: 3333, authority_public_key: 'primary-key', user_identity: 'primary-account' },
  fallbackPools: [{ name: 'Backup pool', address: 'backup.example.com', port: 3333, authority_public_key: 'backup-key', user_identity: 'backup-account' }],
};

function render(activePoolIndex?: number | null): string {
  return renderToStaticMarkup(
    <ConfigurationEditor
      config={config}
      onSave={() => true}
      onSetupRequired={() => {}}
      isSaving={false}
      saveLabel="Save"
      activePoolIndex={activePoolIndex}
    />,
  );
}

test('marks the pool the running services use, and none before they run', () => {
  assert.equal(render(1).match(/>Current</g)?.length, 1);
  assert.match(render(1), /Backup pool.*Current/s);
  assert.doesNotMatch(render(), />Current</);
});
