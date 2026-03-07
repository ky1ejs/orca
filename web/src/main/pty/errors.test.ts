import { describe, expect, it } from 'vitest';
import {
  AgentError,
  ClaudeNotFoundError,
  InvalidWorkingDirectoryError,
  PtySpawnError,
  ProcessCrashError,
  AuthNotConfiguredError,
  serializeError,
} from './errors.js';

describe('AgentError classes', () => {
  it('AgentError has correct name, message, and suggestion', () => {
    const err = new AgentError('test message', 'test suggestion');
    expect(err.name).toBe('AgentError');
    expect(err.message).toBe('test message');
    expect(err.suggestion).toBe('test suggestion');
    expect(err).toBeInstanceOf(Error);
  });

  it('ClaudeNotFoundError has correct properties', () => {
    const err = new ClaudeNotFoundError();
    expect(err.name).toBe('ClaudeNotFoundError');
    expect(err.message).toContain('Claude CLI not found');
    expect(err.suggestion).toContain('Install');
  });

  it('InvalidWorkingDirectoryError includes the directory path', () => {
    const err = new InvalidWorkingDirectoryError('/some/path');
    expect(err.name).toBe('InvalidWorkingDirectoryError');
    expect(err.message).toContain('/some/path');
    expect(err.suggestion).toContain('path');
  });

  it('PtySpawnError wraps the cause', () => {
    const cause = new Error('spawn failed');
    const err = new PtySpawnError(cause);
    expect(err.name).toBe('PtySpawnError');
    expect(err.message).toContain('spawn failed');
  });

  it('PtySpawnError handles non-Error cause', () => {
    const err = new PtySpawnError('string cause');
    expect(err.message).toContain('string cause');
  });

  it('ProcessCrashError includes exit code', () => {
    const err = new ProcessCrashError(1);
    expect(err.name).toBe('ProcessCrashError');
    expect(err.message).toContain('exit code 1');
  });

  it('AuthNotConfiguredError has correct properties', () => {
    const err = new AuthNotConfiguredError();
    expect(err.name).toBe('AuthNotConfiguredError');
    expect(err.message).toContain('Auth token');
  });
});

describe('serializeError', () => {
  it('serializes AgentError correctly', () => {
    const err = new ClaudeNotFoundError();
    const serialized = serializeError(err);
    expect(serialized.name).toBe('ClaudeNotFoundError');
    expect(serialized.message).toContain('Claude CLI');
    expect(serialized.suggestion).toContain('Install');
  });

  it('serializes generic Error', () => {
    const err = new Error('something went wrong');
    const serialized = serializeError(err);
    expect(serialized.name).toBe('UnknownError');
    expect(serialized.message).toBe('something went wrong');
    expect(serialized.suggestion).toBeTruthy();
  });

  it('serializes non-Error values', () => {
    const serialized = serializeError('string error');
    expect(serialized.name).toBe('UnknownError');
    expect(serialized.message).toBe('string error');
  });
});
