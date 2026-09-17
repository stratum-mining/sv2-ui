import type { SetupData } from './types.js';

export const BITCOIN_PROBE_IMAGE = 'node:24-alpine';

export const SV2_APP_IMAGES = {
  // Pinned to the sv2-apps v0.8.0 release tags and their multi-arch index digests.
  translatorNoJd: 'stratumv2/translator_sv2:v0.8.0@sha256:a6b7380999fb6048caa269766afc64541880849cec6c34594e48133ca4d454ef',
  jd: {
    jdc: 'stratumv2/jd_client_sv2:v0.8.0@sha256:95bfe11b224c1985f25188a0efc58c1e798458fe838b053d4d10ed86dba3a715',
    translator: 'stratumv2/translator_sv2:v0.8.0@sha256:a6b7380999fb6048caa269766afc64541880849cec6c34594e48133ca4d454ef',
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
