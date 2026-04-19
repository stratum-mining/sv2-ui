import type { ImageConfig, ImagePullPolicy } from './types.js';

export const DEFAULT_TRANSLATOR_IMAGE = 'stratumv2/translator_sv2:main';
export const DEFAULT_JDC_IMAGE = 'stratumv2/jd_client_sv2:main';

export interface ResolvedImageConfig {
  translatorImage: string;
  jdcImage: string;
  pullPolicy: ImagePullPolicy;
}

export type ImageFetchAction = 'pull' | 'use-local' | 'error-missing-local';

interface ResolveRuntimeImagesOptions {
  env?: NodeJS.ProcessEnv;
  logger?: Pick<Console, 'warn'>;
}

function cleanString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePullPolicy(value: string): ImagePullPolicy | null {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'always') return 'always';
  if (normalized === 'never') return 'never';
  if (normalized === 'if-not-present' || normalized === 'if_not_present' || normalized === 'ifnotpresent') {
    return 'if-not-present';
  }

  return null;
}

export function normalizeImagePullPolicy(
  rawPolicy: string | null | undefined,
  logger: Pick<Console, 'warn'> = console
): ImagePullPolicy {
  const cleaned = cleanString(rawPolicy);
  if (!cleaned) return 'always';

  const policy = parsePullPolicy(cleaned);
  if (policy) return policy;

  logger.warn(
    `Invalid SV2 image pull policy "${cleaned}". ` +
    'Supported values: always, if-not-present, never. Falling back to "always".'
  );
  return 'always';
}

function resolveImageRef(explicitRef: string | null | undefined, envRef: string | null | undefined, fallback: string): string {
  return cleanString(explicitRef) || cleanString(envRef) || fallback;
}

export function resolveImageFetchAction(pullPolicy: ImagePullPolicy, hasLocalImage: boolean): ImageFetchAction {
  if (pullPolicy === 'always') return 'pull';
  if (hasLocalImage) return 'use-local';
  if (pullPolicy === 'never') return 'error-missing-local';
  return 'pull';
}

export function resolveRuntimeImages(
  imageConfig: ImageConfig | null | undefined,
  options: ResolveRuntimeImagesOptions = {}
): ResolvedImageConfig {
  const env = options.env ?? process.env;
  const logger = options.logger ?? console;

  return {
    translatorImage: resolveImageRef(
      imageConfig?.translator_image,
      env.TRANSLATOR_IMAGE,
      DEFAULT_TRANSLATOR_IMAGE
    ),
    jdcImage: resolveImageRef(
      imageConfig?.jdc_image,
      env.JDC_IMAGE,
      DEFAULT_JDC_IMAGE
    ),
    pullPolicy: normalizeImagePullPolicy(
      imageConfig?.pull_policy ?? env.SV2_IMAGE_PULL_POLICY,
      logger
    ),
  };
}
