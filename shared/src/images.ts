import type { SetupData } from './types.js';

export const BITCOIN_PROBE_IMAGE = 'node:24-alpine';

export const SV2_APP_IMAGES = {
  // Pinned to the sv2-apps v0.9.2 release tags and their multi-arch index digests.
  translatorNoJd: 'stratumv2/translator_sv2:v0.9.2@sha256:096eb6aa2e9d8d59feb347145e08a3a1a044491e013f0ed935f1044d8455b1ef',
  jd: {
    jdc: 'stratumv2/jd_client_sv2:v0.9.2@sha256:afa1c4f93410e67bd55f6b469369664ee90d0a8f7fe70bf82ff3aacf0b0c9d05',
    translator: 'stratumv2/translator_sv2:v0.9.2@sha256:096eb6aa2e9d8d59feb347145e08a3a1a044491e013f0ed935f1044d8455b1ef',
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
