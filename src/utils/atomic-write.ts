import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Write a file atomically using write-then-rename.
 * Prevents partial writes on crash.
 */
export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  const tmpPath = join(dir, `.${Date.now()}.tmp`);
  await writeFile(tmpPath, content, 'utf-8');
  await rename(tmpPath, filePath);
}
