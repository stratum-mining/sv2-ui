import type { SetupData } from './types.js';

export const BITCOIN_PROBE_IMAGE = 'node:24-alpine';

export const SV2_APP_IMAGES = {
  // Pinned to the sv2-apps v0.9.1 release tags and their multi-arch index digests.
  translatorNoJd: 'stratumv2/translator_sv2:v0.9.1@sha256:b29c48e242e4dca61daeea9c4d060f437ae7f9aef957199237ad4d2aba90b364',
  jd: {
    jdc: 'stratumv2/jd_client_sv2:v0.9.1@sha256:ce44754eac0ab66b4afd84d79b1de9579f8c32668b9aba876a4a5663b487148a',
    translator: 'stratumv2/translator_sv2:v0.9.1@sha256:b29c48e242e4dca61daeea9c4d060f437ae7f9aef957199237ad4d2aba90b364',
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
