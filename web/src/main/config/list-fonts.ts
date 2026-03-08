import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

let cachedFonts: string[] | null = null;

export async function listSystemFonts(): Promise<string[]> {
  if (cachedFonts) return cachedFonts;

  if (process.platform === 'darwin') {
    cachedFonts = await listMacOSFonts();
  } else if (process.platform === 'linux') {
    cachedFonts = await listLinuxFonts();
  } else {
    cachedFonts = [];
  }

  return cachedFonts;
}

async function listMacOSFonts(): Promise<string[]> {
  try {
    const script = [
      'ObjC.import("AppKit")',
      'const fm = $.NSFontManager.sharedFontManager',
      'const families = fm.availableFontFamilies',
      'const result = []',
      'for (let i = 0; i < families.count; i++) { result.push(families.objectAtIndex(i).js) }',
      'result.join("\\n")',
    ].join('; ');
    const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', '-e', script]);
    return stdout.trim().split('\n').filter(Boolean).sort();
  } catch {
    return [];
  }
}

async function listLinuxFonts(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('fc-list', [':', 'family']);
    const families = new Set<string>();
    for (const line of stdout.trim().split('\n')) {
      // fc-list returns comma-separated families per font file
      for (const family of line.split(',')) {
        const trimmed = family.trim();
        if (trimmed) families.add(trimmed);
      }
    }
    return [...families].sort();
  } catch {
    return [];
  }
}
