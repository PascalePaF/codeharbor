import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { migrateLegacyVault, resolveDataDirectory } from './data-location';

describe('data location', () => {
  it('keeps packaged data beside the executable', () => {
    const result = resolveDataDirectory({
      isPackaged: true,
      executablePath: 'D:\\Apps\\CodeHarbor\\CodeHarbor.exe',
      workingDirectory: 'C:\\workspace',
    });
    expect(result).toBe('D:\\Apps\\CodeHarbor\\CodeHarbor-Data');
  });

  it('keeps portable data beside the launcher instead of the temporary unpack directory', () => {
    const result = resolveDataDirectory({
      isPackaged: true,
      executablePath: 'C:\\Temp\\CodeHarborPortable\\CodeHarbor.exe',
      portableExecutableDirectory: 'D:\\Portable Apps\\CodeHarbor',
      workingDirectory: 'C:\\Temp\\CodeHarborPortable',
    });
    expect(result).toBe('D:\\Portable Apps\\CodeHarbor\\CodeHarbor-Data');
  });

  it('migrates a valid legacy vault once without overwriting a target', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codeharbor-data-test-'));
    const legacy = join(root, 'old', 'vault.json');
    const target = join(root, 'new', 'vault.json');
    await mkdir(join(root, 'old'));
    const payload = JSON.stringify({ schemaVersion: 1, accounts: [], totpEntries: [], settings: {} });
    await writeFile(legacy, payload);
    await expect(migrateLegacyVault(legacy, target)).resolves.toBe(true);
    await expect(readFile(target, 'utf8')).resolves.toBe(payload);
    await expect(migrateLegacyVault(legacy, target)).resolves.toBe(false);
  });
});
