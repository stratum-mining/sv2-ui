import { execFileSync } from 'node:child_process';

export interface BuildInfo {
  version: string;
  commit: string | null;
}

/**
 * The sv2-ui build. The release workflow sets `SV2_UI_VERSION` and
 * `SV2_UI_COMMIT` in the image. Without them, as under `npm run dev`, the
 * branch and commit come from the git checkout around `cwd`. Images leave
 * `.git` out (see `.dockerignore`), so an image built without the build args
 * reads `dev`.
 */
export function readBuildInfo(env: NodeJS.ProcessEnv, cwd: string): BuildInfo {
  if (env.SV2_UI_VERSION) {
    return { version: env.SV2_UI_VERSION, commit: env.SV2_UI_COMMIT || null };
  }

  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();

  try {
    return { version: git('rev-parse', '--abbrev-ref', 'HEAD'), commit: git('rev-parse', 'HEAD') };
  } catch {
    return { version: 'dev', commit: null };
  }
}
