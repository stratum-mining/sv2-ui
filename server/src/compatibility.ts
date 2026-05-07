import type { SetupData } from './types.js';

export type BitcoinCoreVersion = '30.2' | '31.0';

export type CompatibilityProfileId =
  | 'bitcoin-core-30.2'
  | 'bitcoin-core-31.0';

export interface CompatibilityProfile {
  id: CompatibilityProfileId;
  bitcoinCoreVersion: BitcoinCoreVersion;
  status: 'supported';
  images: {
    jdc: string;
    translator: string;
  };
  monitoringApi: {
    jdc: string;
    translator: string;
  };
}

export const SV2_APP_IMAGES = {
  translatorNoJd: 'stratumv2/translator_sv2:v0.4.0',
  byBitcoinCore: {
    '30.2': {
      jdc: 'stratumv2/jd_client_sv2:v0.3.5',
      translator: 'stratumv2/translator_sv2:v0.3.5',
    },
    '31.0': {
      jdc: 'stratumv2/jd_client_sv2:v0.4.0',
      translator: 'stratumv2/translator_sv2:v0.4.0',
    },
  },
} as const satisfies {
  translatorNoJd: string;
  byBitcoinCore: Record<BitcoinCoreVersion, { jdc: string; translator: string }>;
};

export type SetupImageSelection =
  | {
      mode: 'no-jd';
      translator: string;
    }
  | {
      mode: 'jd';
      profile: CompatibilityProfile;
      jdc: string;
      translator: string;
    };

export const COMPATIBILITY_PROFILES: Record<BitcoinCoreVersion, CompatibilityProfile> = {
  '30.2': {
    id: 'bitcoin-core-30.2',
    bitcoinCoreVersion: '30.2',
    status: 'supported',
    images: SV2_APP_IMAGES.byBitcoinCore['30.2'],
    monitoringApi: {
      jdc: '/api/v1',
      translator: '/api/v1',
    },
  },
  '31.0': {
    id: 'bitcoin-core-31.0',
    bitcoinCoreVersion: '31.0',
    status: 'supported',
    images: SV2_APP_IMAGES.byBitcoinCore['31.0'],
    monitoringApi: {
      jdc: '/api/v1',
      translator: '/api/v1',
    },
  },
} as const;

export function isSupportedBitcoinCoreVersion(
  version: string | null | undefined
): version is BitcoinCoreVersion {
  return version === '30.2' || version === '31.0';
}

export function getCompatibilityProfileForBitcoinCore(
  version: string | null | undefined
): CompatibilityProfile {
  if (!isSupportedBitcoinCoreVersion(version)) {
    throw new Error(
      'Unsupported or missing Bitcoin Core version. Select Bitcoin Core 30.2 or 31.0 before starting the stack.'
    );
  }

  return COMPATIBILITY_PROFILES[version];
}

export function getImageSelectionForSetup(data: SetupData): SetupImageSelection {
  if (data.mode === 'no-jd') {
    return {
      mode: 'no-jd',
      translator: SV2_APP_IMAGES.translatorNoJd,
    };
  }

  if (data.mode === 'jd') {
    const profile = getCompatibilityProfileForBitcoinCore(data.bitcoin?.core_version);

    return {
      mode: 'jd',
      profile,
      jdc: profile.images.jdc,
      translator: profile.images.translator,
    };
  }

  throw new Error('Setup mode is required before selecting sv2-apps images.');
}
