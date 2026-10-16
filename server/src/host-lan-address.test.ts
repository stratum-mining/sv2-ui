import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { NetworkInterfaceInfo } from 'node:os';
import { minerTelemetryCidrForAddress } from '@sv2-ui/shared';
import { darwinDefaultRouteInterface, defaultRouteAddress, hostNetworkProbeScript } from './host-lan-address.js';

const ROUTES = [
  'Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT',
  'wlan0\t00000000\t0101A8C0\t0003\t0\t0\t600\t00000000\t0\t0\t0',
  'eth0\t00000000\t0101A8C0\t0003\t0\t0\t100\t00000000\t0\t0\t0',
  'eth0\t0001A8C0\t00000000\t0001\t0\t0\t100\t00FFFFFF\t0\t0\t0',
  'docker0\t000011AC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0',
].join('\n');

function ipv4(address: string): NetworkInterfaceInfo {
  return { address, netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: false, cidr: `${address}/24` };
}

test('defaultRouteAddress picks the interface of the lowest-metric default route', () => {
  const interfaces = {
    eth0: [ipv4('192.168.1.20')],
    wlan0: [ipv4('192.168.1.21')],
    docker0: [ipv4('172.17.0.1')],
  };

  assert.equal(defaultRouteAddress(ROUTES, interfaces), '192.168.1.20');
});

test('defaultRouteAddress returns null without a default route or an IPv4 address on it', () => {
  const withoutDefault = ROUTES.split('\n').filter((line) => !line.includes('\t00000000\t0101A8C0')).join('\n');

  assert.equal(defaultRouteAddress(withoutDefault, { eth0: [ipv4('192.168.1.20')] }), null);
  assert.equal(defaultRouteAddress(ROUTES, {}), null);
});

test('darwinDefaultRouteInterface reads the interface from route -n get default', () => {
  const output = [
    '   route to: default',
    'destination: default',
    '       mask: default',
    '    gateway: 192.168.1.1',
    '  interface: en0',
    '      flags: <UP,GATEWAY,DONE,STATIC,PRCLONING,GLOBAL>',
  ].join('\n');

  assert.equal(darwinDefaultRouteInterface(output), 'en0');
  assert.equal(darwinDefaultRouteInterface('route: writing to routing socket: not in table'), null);
});

test('minerTelemetryCidrForAddress turns a private IPv4 address into its /24', () => {
  assert.equal(minerTelemetryCidrForAddress('192.168.1.37'), '192.168.1.0/24');
  assert.equal(minerTelemetryCidrForAddress(' 10.0.5.9 '), '10.0.5.0/24');
  assert.equal(minerTelemetryCidrForAddress('8.8.8.8'), '');
  assert.equal(minerTelemetryCidrForAddress('192.168.1.256'), '');
  assert.equal(minerTelemetryCidrForAddress('192.168.1.0/24'), '');
  assert.equal(minerTelemetryCidrForAddress(null), '');
});

test('hostNetworkProbeScript prints the routes and interfaces as JSON', (t) => {
  if (!existsSync('/proc/net/route')) {
    t.skip('/proc/net/route is only available on Linux');
    return;
  }

  const output = JSON.parse(execFileSync(process.execPath, ['-e', hostNetworkProbeScript], { encoding: 'utf8' }));

  assert.equal(typeof output.routes, 'string');
  assert.equal(typeof output.interfaces, 'object');
});
