import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export interface DataDirectoryOptions {
  isPackaged: boolean;
  executablePath: string;
  workingDirectory: string;
  portableExecutableDirectory?: string;
  overrideDirectory?: string;
  smokeDirectory?: string;
}

export function resolveDataDirectory(options: DataDirectoryOptions): string {
  if (options.overrideDirectory) return resolve(options.overrideDirectory);
  if (options.smokeDirectory) return resolve(options.smokeDirectory);
  if (options.portableExecutableDirectory) {
    return join(resolve(options.portableExecutableDirectory), 'CodeHarbor-Data');
  }
  if (options.isPackaged) return join(dirname(options.executablePath), 'CodeHarbor-Data');
  return join(resolve(options.workingDirectory), 'CodeHarbor-Data');
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function looksLikeVault(source: Buffer): boolean {
  try {
    const parsed = JSON.parse(source.toString('utf8')) as Record<string, unknown>;
    return parsed.schemaVersion === 1 && Array.isArray(parsed.accounts) && Array.isArray(parsed.totpEntries);
  } catch {
    return false;
  }
}

export async function migrateLegacyVault(legacyPath: string, targetPath: string): Promise<boolean> {
  if (samePath(legacyPath, targetPath)) return false;
  let source: Buffer;
  try {
    source = await readFile(legacyPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  if (!looksLikeVault(source)) throw new Error('旧版保险库格式异常，已停止自动迁移以保护原文件');

  try {
    await readFile(targetPath);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  await mkdir(dirname(targetPath), { recursive: true });
  try {
    await copyFile(legacyPath, targetPath, constants.COPYFILE_EXCL);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }

  const copied = await readFile(targetPath);
  if (!source.equals(copied)) {
    await unlink(targetPath).catch(() => undefined);
    throw new Error('旧版保险库迁移校验失败，原文件保持不变');
  }
  await unlink(legacyPath).catch(() => undefined);
  return true;
}
