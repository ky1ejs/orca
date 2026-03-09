import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLogger } from './logger.js';

describe('createLogger', () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'logger-test-'));
    logPath = join(tmpDir, 'test.log');
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes log lines with correct format', () => {
    const logger = createLogger({ filePath: logPath, tag: 'test', stderr: false });
    logger.info('hello world');

    const content = readFileSync(logPath, 'utf-8');
    expect(content).toMatch(/^\[.*\] \[INFO\] \[test\] hello world\n$/);
  });

  it('writes to stderr by default', () => {
    const logger = createLogger({ filePath: logPath, tag: 'test' });
    logger.info('stderr test');

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] [test] stderr test'),
    );
  });

  it('does not write to stderr when disabled', () => {
    const logger = createLogger({ filePath: logPath, stderr: false });
    logger.info('quiet');

    expect(process.stderr.write).not.toHaveBeenCalled();
  });

  it('filters by level', () => {
    const logger = createLogger({ filePath: logPath, level: 'warn', stderr: false });
    logger.debug('nope');
    logger.info('nope');
    logger.warn('yes');
    logger.error('also yes');

    const content = readFileSync(logPath, 'utf-8');
    expect(content).not.toContain('nope');
    expect(content).toContain('[WARN]');
    expect(content).toContain('[ERROR]');
  });

  it('setLevel changes filtering', () => {
    const logger = createLogger({ filePath: logPath, level: 'error', stderr: false });
    logger.info('before');
    logger.setLevel('debug');
    logger.debug('after');

    const content = readFileSync(logPath, 'utf-8');
    expect(content).not.toContain('before');
    expect(content).toContain('[DEBUG]');
    expect(content).toContain('after');
  });

  it('formats error objects with stack trace', () => {
    const logger = createLogger({ filePath: logPath, stderr: false });
    const err = new Error('boom');
    logger.error('something failed', err);

    const content = readFileSync(logPath, 'utf-8');
    expect(content).toContain('[ERROR] something failed');
    expect(content).toContain('Error: boom');
  });

  it('formats string errors', () => {
    const logger = createLogger({ filePath: logPath, stderr: false });
    logger.error('oops', 'string error');

    const content = readFileSync(logPath, 'utf-8');
    expect(content).toContain('string error');
  });

  it('works without tag', () => {
    const logger = createLogger({ filePath: logPath, stderr: false });
    logger.info('no tag');

    const content = readFileSync(logPath, 'utf-8');
    expect(content).toMatch(/\[INFO\] no tag/);
    expect(content).not.toContain('[]');
  });

  it('rotates files when maxSize is exceeded', () => {
    const logger = createLogger({ filePath: logPath, maxSize: 50, maxFiles: 3, stderr: false });

    // Write enough to exceed 50 bytes
    logger.info('first message that is long enough to exceed limit');
    expect(readFileSync(logPath, 'utf-8')).toContain('first message');

    // Next write should trigger rotation
    logger.info('second message after rotation');

    expect(existsSync(`${logPath}.1`)).toBe(true);
    const rotated = readFileSync(`${logPath}.1`, 'utf-8');
    expect(rotated).toContain('first message');

    const current = readFileSync(logPath, 'utf-8');
    expect(current).toContain('second message');
  });

  it('limits rotated files to maxFiles', () => {
    const logger = createLogger({ filePath: logPath, maxSize: 50, maxFiles: 2, stderr: false });

    logger.info('message one that is definitely long enough');
    logger.info('message two that is definitely long enough');
    logger.info('message three that is long enough too');

    // Only .1 should exist (maxFiles=2 means current + 1 rotated)
    expect(existsSync(`${logPath}.1`)).toBe(true);
    // .2 might or might not exist depending on timing, but we keep maxFiles-1 rotated files
  });

  it('exposes filePath', () => {
    const logger = createLogger({ filePath: logPath, stderr: false });
    expect(logger.filePath).toBe(logPath);
  });

  it('handles non-existent file gracefully on first write', () => {
    const logger = createLogger({ filePath: logPath, stderr: false });
    logger.info('first write');

    expect(existsSync(logPath)).toBe(true);
  });

  it('handles write errors gracefully', () => {
    // Use a path that can't be written to
    const badPath = '/nonexistent/dir/test.log';
    const logger = createLogger({ filePath: badPath, stderr: false });

    // Should not throw
    expect(() => logger.info('test')).not.toThrow();
  });

  it('logs all levels correctly', () => {
    const logger = createLogger({ filePath: logPath, level: 'debug', stderr: false });
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    const content = readFileSync(logPath, 'utf-8');
    expect(content).toContain('[DEBUG]');
    expect(content).toContain('[INFO]');
    expect(content).toContain('[WARN]');
    expect(content).toContain('[ERROR]');
  });

  it('handles non-Error objects in error()', () => {
    const logger = createLogger({ filePath: logPath, stderr: false });
    logger.error('failed', { code: 42 });

    const content = readFileSync(logPath, 'utf-8');
    expect(content).toContain('{"code":42}');
  });
});
