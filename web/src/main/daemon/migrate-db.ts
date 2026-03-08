/**
 * One-time migration: copy old DB from Electron userData to ~/.orca/
 */
import { constants, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function migrateDb(newDbPath: string, oldDbPath: string): { migrated: boolean } {
  if (!existsSync(oldDbPath)) return { migrated: false };

  try {
    mkdirSync(dirname(newDbPath), { recursive: true });

    // COPYFILE_EXCL fails atomically if newDbPath already exists,
    // avoiding a TOCTOU race with the daemon process.
    copyFileSync(oldDbPath, newDbPath, constants.COPYFILE_EXCL);

    // Also copy WAL/SHM files if they exist (best effort, no EXCL)
    const walPath = oldDbPath + '-wal';
    const shmPath = oldDbPath + '-shm';
    if (existsSync(walPath)) copyFileSync(walPath, newDbPath + '-wal');
    if (existsSync(shmPath)) copyFileSync(shmPath, newDbPath + '-shm');

    return { migrated: true };
  } catch {
    // Migration failed (destination exists, bad permissions, etc.) — daemon will create a fresh DB
    return { migrated: false };
  }
}
