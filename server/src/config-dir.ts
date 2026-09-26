import fs from 'node:fs/promises';

/**
 * Create the managed config directory when missing and keep an existing one
 * at owner-only permissions.
 *
 * mkdir's mode only applies to entries it creates itself, so a directory that
 * already exists (created by the Dockerfile, an older version, or another
 * setup path) is chmod'ed as well. The chmod runs through a no-follow
 * descriptor: fs.chmod(path) follows symlinks, so an entry swapped for a link
 * between the mkdir and the chmod could otherwise retarget the chmod outside
 * the managed volume. A symlinked directory is left alone entirely.
 *
 * Restricting is best-effort: running unprivileged against a root-owned bind
 * mount makes chmod fail with EPERM, which is warned about instead of
 * turning a working setup into a failing one.
 */
export async function ensureConfigDir(configDir: string): Promise<void> {
  await fs.mkdir(configDir, { recursive: true, mode: 0o700 });

  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(
      configDir,
      fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
    );
    await handle.chmod(0o700);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ELOOP' || code === 'ENOTDIR') return;
    if (code === 'EPERM' || code === 'EACCES') {
      console.warn(`Could not restrict config directory permissions at ${configDir}: ${code}`);
      return;
    }
    throw error;
  } finally {
    await handle?.close();
  }
}
