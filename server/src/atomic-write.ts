import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Write a file using a same-directory temporary file and rename. A reader
 * therefore sees either the previous complete file or the new complete file,
 * never a partially-written one.
 */
export async function writeFileAtomically(filePath: string, contents: string): Promise<void> {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );

  let mode: number | undefined;
  try {
    const stat = await fs.lstat(filePath);
    if (stat.isSymbolicLink()) {
      throw new Error('Refusing to inherit permissions from a symbolic link');
    }
    mode = stat.mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(temporaryPath, 'w', mode ?? 0o600);
    // The mode passed to fs.open is still filtered by the process umask, so an
    // existing 0644 file would become 0600 under umask 077. Re-apply the exact
    // mode we read from the original file so the rename preserves it.
    if (mode !== undefined) await handle.chmod(mode);
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
