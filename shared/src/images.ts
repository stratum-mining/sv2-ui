import type { SetupData } from './types.js';

export const BITCOIN_PROBE_IMAGE = 'node:24-alpine';

export const SV2_APP_IMAGES = {
  // Development branches track sv2-apps `main`. The matching release/vX
  // branch replaces all of these with its approved sv2-apps `vX` release
  // tags before sv2-ui is published.
  translatorNoJd: 'stratumv2/translator_sv2:main',
  jd: {
    jdc: 'stratumv2/jd_client_sv2:main',
    translator: 'stratumv2/translator_sv2:main',
  },
} as const satisfies {
  translatorNoJd: string;
  jd: { jdc: string; translator: string };
};

export type SetupImageSelection =
  | {
      mode: 'no-jd';
      translator: string;
    }
  | {
      mode: 'jd';
      jdc: string;
      translator: string;
    };

export function getImageSelectionForSetup(data: SetupData): SetupImageSelection {
  if (data.mode === 'no-jd') {
    return {
      mode: 'no-jd',
      translator: SV2_APP_IMAGES.translatorNoJd,
    };
  }

  if (data.mode === 'jd') {
    return {
      mode: 'jd',
      jdc: SV2_APP_IMAGES.jd.jdc,
      translator: SV2_APP_IMAGES.jd.translator,
    };
  }

  throw new Error('Setup mode is required before selecting sv2-apps images.');
}

/**
 * Returns the tag of an image reference from this file, dropping the
 * repository and any `@sha256:` digest: `stratumv2/translator_sv2:v0.9.2@sha256:…`
 * gives `v0.9.2`. Every reference here names its tag, on `main` as well as on
 * release branches.
 */
export function getImageTag(image: string): string {
  const withoutDigest = image.split('@', 1)[0];
  return withoutDigest.slice(withoutDigest.lastIndexOf(':') + 1);
}

/**
 * The distinct tags of the selected sv2-apps images. A release pins every
 * image to the same sv2-apps release, so this normally holds one entry.
 */
export function getSv2AppsVersions(): string[] {
  const images = [SV2_APP_IMAGES.translatorNoJd, SV2_APP_IMAGES.jd.jdc, SV2_APP_IMAGES.jd.translator];
  return [...new Set(images.map(getImageTag))];
}
