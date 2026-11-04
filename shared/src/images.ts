import type { SetupData } from './types.js';

export const BITCOIN_PROBE_IMAGE = 'node:24-alpine';

export const SV2_APP_IMAGES = {
  // Pinned to the sv2-apps v0.9.0 release tags and their multi-arch index digests.
  translatorNoJd: 'stratumv2/translator_sv2:v0.9.0@sha256:f1dca20242605cf3b3457d4212c07818c8cf41b10ef1280645cf6e53ff85a576',
  jd: {
    jdc: 'stratumv2/jd_client_sv2:v0.9.0@sha256:1dc04f0503611efdee875dbd43c3d3b73765f1a6ae0d6f000002ae5aab8d7ad8',
    translator: 'stratumv2/translator_sv2:v0.9.0@sha256:f1dca20242605cf3b3457d4212c07818c8cf41b10ef1280645cf6e53ff85a576',
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
