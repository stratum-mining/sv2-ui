import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_JDC_IMAGE,
  DEFAULT_TRANSLATOR_IMAGE,
  normalizeImagePullPolicy,
  resolveRuntimeImages,
} from '../image-config.js';

test('normalizeImagePullPolicy correctly parses policies', () => {
  const dummyLogger = { warn: () => {} };

  assert.equal(normalizeImagePullPolicy('always', dummyLogger), 'always');
  assert.equal(normalizeImagePullPolicy('never', dummyLogger), 'never');
  assert.equal(normalizeImagePullPolicy('if-not-present', dummyLogger), 'if-not-present');
  assert.equal(normalizeImagePullPolicy('if_not_present', dummyLogger), 'if-not-present');
  assert.equal(normalizeImagePullPolicy('ifnotpresent', dummyLogger), 'if-not-present');

  assert.equal(normalizeImagePullPolicy('random', dummyLogger), 'always');
  assert.equal(normalizeImagePullPolicy('', dummyLogger), 'always');
  assert.equal(normalizeImagePullPolicy(null, dummyLogger), 'always');
  assert.equal(normalizeImagePullPolicy(undefined, dummyLogger), 'always');
});

test('resolveRuntimeImages respects explicit config over env', () => {
  const options = {
    env: {
      TRANSLATOR_IMAGE: 'env/translator:test',
      JDC_IMAGE: 'env/jdc:test',
      SV2_IMAGE_PULL_POLICY: 'never',
    },
    logger: { warn: () => {} },
  };

  const explicitConfig = {
    translator_image: 'explicit/translator:test',
    jdc_image: 'explicit/jdc:test',
    pull_policy: 'if-not-present' as const,
  };

  const resolved = resolveRuntimeImages(explicitConfig, options);

  assert.equal(resolved.translatorImage, 'explicit/translator:test');
  assert.equal(resolved.jdcImage, 'explicit/jdc:test');
  assert.equal(resolved.pullPolicy, 'if-not-present');
});

test('resolveRuntimeImages falls back to env when config is missing', () => {
  const options = {
    env: {
      TRANSLATOR_IMAGE: 'env/translator:test',
      JDC_IMAGE: 'env/jdc:test',
      SV2_IMAGE_PULL_POLICY: 'never',
    },
    logger: { warn: () => {} },
  };

  const resolved = resolveRuntimeImages(null, options);

  assert.equal(resolved.translatorImage, 'env/translator:test');
  assert.equal(resolved.jdcImage, 'env/jdc:test');
  assert.equal(resolved.pullPolicy, 'never');
});

test('resolveRuntimeImages applies defaults when both config and env are missing', () => {
  const options = {
    env: {},
    logger: { warn: () => {} },
  };

  const resolved = resolveRuntimeImages(undefined, options);

  assert.equal(resolved.translatorImage, DEFAULT_TRANSLATOR_IMAGE);
  assert.equal(resolved.jdcImage, DEFAULT_JDC_IMAGE);
  assert.equal(resolved.pullPolicy, 'always');
});