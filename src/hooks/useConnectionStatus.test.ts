import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveConnectionStatus } from './useConnectionStatus.js';

test('does not report a configured pool as connected before SV2 setup succeeds', () => {
  assert.equal(resolveConnectionStatus({
    isHealthLoading: false,
    servicesHealthy: true,
    translatorOnlyDown: false,
    isOrchestrated: true,
    isRunning: true,
    isDegraded: false,
    isSoloMining: false,
    activePoolIndex: null,
  }), 'connecting');
});

test('reports connected only after an orchestrated pool is confirmed', () => {
  assert.equal(resolveConnectionStatus({
    isHealthLoading: false,
    servicesHealthy: true,
    translatorOnlyDown: false,
    isOrchestrated: true,
    isRunning: true,
    isDegraded: false,
    isSoloMining: false,
    activePoolIndex: 0,
  }), 'connected');
});

test('reports a fallback pool as its own state', () => {
  assert.equal(resolveConnectionStatus({
    isHealthLoading: false,
    servicesHealthy: true,
    translatorOnlyDown: false,
    isOrchestrated: true,
    isRunning: true,
    isDegraded: false,
    isSoloMining: false,
    activePoolIndex: 2,
  }), 'fallback');
});

test('a Translator outage on a fallback pool still reads as degraded', () => {
  assert.equal(resolveConnectionStatus({
    isHealthLoading: false,
    servicesHealthy: false,
    translatorOnlyDown: true,
    isOrchestrated: true,
    isRunning: false,
    isDegraded: true,
    isSoloMining: false,
    activePoolIndex: 1,
  }), 'degraded');
});

test('keeps standalone monitoring compatible without an active pool index', () => {
  assert.equal(resolveConnectionStatus({
    isHealthLoading: false,
    servicesHealthy: true,
    translatorOnlyDown: false,
    isOrchestrated: false,
    isRunning: false,
    isDegraded: false,
    isSoloMining: false,
    activePoolIndex: null,
  }), 'connected');
});

test('reports a JD stack as degraded while only the Translator is down', () => {
  assert.equal(resolveConnectionStatus({
    isHealthLoading: false,
    servicesHealthy: false,
    translatorOnlyDown: true,
    isOrchestrated: true,
    isRunning: false,
    isDegraded: true,
    isSoloMining: false,
    activePoolIndex: 1,
  }), 'degraded');
});

test('reports sovereign solo as degraded while only the Translator is down', () => {
  assert.equal(resolveConnectionStatus({
    isHealthLoading: false,
    servicesHealthy: false,
    translatorOnlyDown: true,
    isOrchestrated: true,
    isRunning: false,
    isDegraded: true,
    isSoloMining: true,
    activePoolIndex: null,
  }), 'degraded');
});

test('keeps connecting while JDC works through its pools and the Translator is down', () => {
  assert.equal(resolveConnectionStatus({
    isHealthLoading: false,
    servicesHealthy: false,
    translatorOnlyDown: true,
    isOrchestrated: true,
    isRunning: false,
    isDegraded: true,
    isSoloMining: false,
    activePoolIndex: null,
  }), 'connecting');
});

test('reports disconnected when JDC is down too', () => {
  assert.equal(resolveConnectionStatus({
    isHealthLoading: false,
    servicesHealthy: false,
    translatorOnlyDown: false,
    isOrchestrated: true,
    isRunning: false,
    isDegraded: false,
    isSoloMining: false,
    activePoolIndex: null,
  }), 'disconnected');
});

test('shows connecting, not disconnected, while JDC switches pools before the Translator health check catches up', () => {
  assert.equal(resolveConnectionStatus({
    isHealthLoading: false,
    // The last Translator health check still passed.
    servicesHealthy: true,
    translatorOnlyDown: false,
    isOrchestrated: true,
    isRunning: false,
    isDegraded: true,
    isSoloMining: false,
    activePoolIndex: null,
  }), 'connecting');
});

test('reports JDC solo fallback as its own state instead of waiting for a pool', () => {
  assert.equal(resolveConnectionStatus({
    isHealthLoading: false,
    servicesHealthy: true,
    translatorOnlyDown: false,
    isOrchestrated: true,
    isRunning: true,
    isDegraded: false,
    isSoloMining: true,
    isSoloFallback: true,
    activePoolIndex: null,
  }), 'fallback');
});

test('a Translator outage during the solo fallback still reads as degraded', () => {
  assert.equal(resolveConnectionStatus({
    isHealthLoading: false,
    servicesHealthy: false,
    translatorOnlyDown: true,
    isOrchestrated: true,
    isRunning: false,
    isDegraded: true,
    isSoloMining: true,
    isSoloFallback: true,
    activePoolIndex: null,
  }), 'degraded');
});
