import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HealthStatus } from '@sv2-ui/shared';
import type { ContainerStatus } from './types.js';
import { isOnlyTranslatorStopped, isStackRunning } from './stack-health.js';

function container(name: string, status: HealthStatus): ContainerStatus {
  return { id: name, name, status, ports: {} };
}

const up = {
  translator: container('sv2-translator', 'starting'),
  jdc: container('sv2-jdc', 'healthy'),
};

test('JD stack runs only while both JDC and the Translator are up', () => {
  assert.equal(isStackRunning('jd', up), true);
  assert.equal(isStackRunning('jd', { ...up, translator: container('sv2-translator', 'stopped') }), false);
  assert.equal(isStackRunning('jd', { ...up, jdc: null }), false);
});

test('no-JD stack runs while the Translator is up', () => {
  assert.equal(isStackRunning('no-jd', { translator: up.translator, jdc: null }), true);
  assert.equal(isStackRunning('no-jd', { translator: container('sv2-translator', 'stopped'), jdc: null }), false);
});

test('a stopped or removed Translator next to a running JDC needs only a Translator restart', () => {
  assert.equal(isOnlyTranslatorStopped('jd', { ...up, translator: container('sv2-translator', 'stopped') }), true);
  assert.equal(isOnlyTranslatorStopped('jd', { ...up, translator: null }), true);
});

test('a stopped JDC needs the whole stack restarted', () => {
  assert.equal(isOnlyTranslatorStopped('jd', { translator: null, jdc: container('sv2-jdc', 'stopped') }), false);
  assert.equal(isOnlyTranslatorStopped('jd', { translator: up.translator, jdc: null }), false);
  assert.equal(isOnlyTranslatorStopped('jd', { translator: null, jdc: null }), false);
});

test('a fully running stack and no-JD mode never take the Translator-only path', () => {
  assert.equal(isOnlyTranslatorStopped('jd', up), false);
  assert.equal(isOnlyTranslatorStopped('no-jd', { translator: container('sv2-translator', 'stopped'), jdc: null }), false);
  assert.equal(isOnlyTranslatorStopped(null, { translator: null, jdc: up.jdc }), false);
});
