import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Write a file using a same-directory temporary file and rename. A reader
 * therefore sees either the previous complete file or the new complete file,
 * never a partially-written one.
 *
 * The mode is supplied by the caller and applied unconditionally to the
 * temporary file, so no mode is ever inherited from whatever inode happens to
 * sit at the destination (a symlink, FIFO, socket or attacker-owned 0666
 * regular file). rename replaces the destination entry, so a link planted at
 * the path is swapped out for the new regular file, never written through.
 */
export async function writeFileAtomically(
  filePath: string,
  contents: string,
  options: { mode?: number } = {},
): Promise<void> {
  const mode = options.mode ?? 0o600;
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );

  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(temporaryPath, 'w', mode);
    // The mode passed to fs.open is still filtered by the process umask, so
    // re-apply the requested mode with fchmod to make the final mode exact.
    await handle.chmod(mode);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;

    await fs.rename(temporaryPath, filePath);
  } finally {
    await handle?.close();
    await fs.rm(temporaryPath, { force: true });
  }
}
