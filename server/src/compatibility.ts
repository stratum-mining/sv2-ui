import type { SetupData } from './types.js';
import {
  COMPATIBILITY_PROFILES,
  SV2_APP_IMAGES,
  formatSupportedVersions,
  isSupportedBitcoinCoreVersion,
} from '@sv2-ui/shared';
import type { CompatibilityProfile, SetupImageSelection } from '@sv2-ui/shared';

export function getCompatibilityProfileForBitcoinCore(
  version: string | null | undefined
): CompatibilityProfile {
  if (!isSupportedBitcoinCoreVersion(version)) {
    throw new Error(
      `Unsupported or missing Bitcoin Core version. Select Bitcoin Core ${formatSupportedVersions()} before starting the stack.`
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
