import { execFile } from 'child_process';
import fs from 'fs';
import os, { type NetworkInterfaceInfo } from 'os';
import { promisify } from 'util';

/**
 * Prints the routing table and interfaces of the network namespace it runs in.
 * Run with host networking, that is the Docker host's own network.
 */
export const hostNetworkProbeScript = `const fs = require('fs');
const os = require('os');

console.log(JSON.stringify({
  routes: fs.readFileSync('/proc/net/route', 'utf8'),
  interfaces: os.networkInterfaces(),
}));`;

/**
 * Returns the IPv4 address of the interface holding the default route with the
 * lowest metric, given the contents of /proc/net/route.
 */
export function defaultRouteAddress(
  routes: string,
  interfaces: Record<string, NetworkInterfaceInfo[] | undefined>,
): string | null {
  const defaultRoute = routes
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields[1] === '00000000' && fields[7] === '00000000')
    .sort((a, b) => Number(a[6]) - Number(b[6]))[0];
  if (!defaultRoute) return null;

  return interfaceAddress(interfaces, defaultRoute[0]);
}

/** Returns the interface name from the output of macOS `route -n get default`. */
export function darwinDefaultRouteInterface(output: string): string | null {
  return output.match(/^\s*interface:\s*(\S+)/m)?.[1] ?? null;
}

/**
 * Returns the LAN address of the machine this process runs on. Used when the
 * backend runs outside Docker (npm run dev), where it sees the host directly.
 */
export async function localHostLanAddress(): Promise<string | null> {
  try {
    if (process.platform === 'linux') {
      return defaultRouteAddress(fs.readFileSync('/proc/net/route', 'utf8'), os.networkInterfaces());
    }
    if (process.platform === 'darwin') {
      const { stdout } = await promisify(execFile)('/sbin/route', ['-n', 'get', 'default']);
      const name = darwinDefaultRouteInterface(stdout);
      return name ? interfaceAddress(os.networkInterfaces(), name) : null;
    }
  } catch {
    // no default route or no route binary; there is nothing to suggest
  }
  return null;
}

function interfaceAddress(
  interfaces: Record<string, NetworkInterfaceInfo[] | undefined>,
  name: string,
): string | null {
  const address = interfaces[name]?.find((entry) => entry.family === 'IPv4' && !entry.internal);
  return address?.address ?? null;
}
