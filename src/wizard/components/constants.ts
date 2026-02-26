// Constants for wizard components

import type { BitcoinNetwork, NetworkSocketPath } from './types';

export const NETWORK_SOCKET_PATHS: Record<BitcoinNetwork, NetworkSocketPath> = {
  mainnet: {
    label: "Mainnet",
    path: "~/.bitcoin/node.sock",
    macPath: "~/Library/Application Support/Bitcoin/node.sock",
  },
  testnet4: {
    label: "Testnet4",
    path: "~/.bitcoin/testnet4/node.sock",
    macPath: "~/Library/Application Support/Bitcoin/testnet4/node.sock",
  },
  regtest: {
    label: "Regtest",
    path: "~/.bitcoin/regtest/node.sock",
    macPath: "~/Library/Application Support/Bitcoin/regtest/node.sock",
  }
};

// SV2 Apps Release Configuration
// Update these values when a new release is available
// Release page: https://github.com/stratum-mining/sv2-apps/releases
export const SV2_APPS_RELEASE = {
  version: "v0.2.0",
  baseUrl: "https://github.com/stratum-mining/sv2-apps/releases/download/v0.2.0",
  releasePage: "https://github.com/stratum-mining/sv2-apps/releases/tag/v0.2.0",

  // Available platforms (architecture-os combinations)
  platforms: {
    linuxX64: "x86_64-unknown-linux-musl",
    linuxArm64: "aarch64-unknown-linux-musl",
    macosX64: "x86_64-apple-darwin",
    macosArm64: "aarch64-apple-darwin",
  },

  // Tarball names
  tarballs: {
    poolApps: "pool-apps",
    minerApps: "miner-apps",
  }
} as const;

// Detect if running on macOS
export const isMacOS = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase();
  const platformStr = navigator.platform.toLowerCase();
  return platformStr.includes('mac') || userAgent.includes('mac');
};

// Detect platform for download URLs
export const getPlatform = (): string => {
  const userAgent = navigator.userAgent.toLowerCase();
  const platformStr = navigator.platform.toLowerCase();

  // Check if macOS
  if (isMacOS()) {
    // macOS - check architecture
    if (userAgent.includes('arm64') || userAgent.includes('aarch64') ||
        platformStr.includes('arm') || navigator.userAgent.includes('ARM')) {
      return SV2_APPS_RELEASE.platforms.macosArm64;
    }
    return SV2_APPS_RELEASE.platforms.macosX64;
  }

  // Linux - check architecture
  if (userAgent.includes('arm64') || userAgent.includes('aarch64') ||
      platformStr.includes('arm') || navigator.userAgent.includes('ARM')) {
    return SV2_APPS_RELEASE.platforms.linuxArm64;
  }

  return SV2_APPS_RELEASE.platforms.linuxX64;
};

// Get the default socket path for a network based on detected OS
// Returns absolute path with a placeholder for username
export const getDefaultSocketPath = (network: BitcoinNetwork): string => {
  const paths = NETWORK_SOCKET_PATHS[network];
  const templatePath = isMacOS() ? paths.macPath : paths.path;

  // Replace ~ with absolute path placeholder
  if (isMacOS()) {
    return templatePath.replace('~', '/Users/<username>');
  }
  return templatePath.replace('~', '/home/<username>');
};

// Helper to get download URL for a tarball
export const getDownloadUrl = (tarball: 'poolApps' | 'minerApps', platform?: string): string => {
  const p = platform || getPlatform();
  const tarballName = SV2_APPS_RELEASE.tarballs[tarball];
  return `${SV2_APPS_RELEASE.baseUrl}/${tarballName}-${p}.tar.gz`;
};
