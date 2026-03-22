import { describe, expect, it } from 'vitest';
import { DaemonServer } from './server.js';

describe('DaemonServer.consolidateEvents', () => {
  it('merges pty.data events for the same session', () => {
    const events = [
      { event: 'pty.data', params: { sessionId: 'a', data: 'hello ' } },
      { event: 'pty.data', params: { sessionId: 'a', data: 'world' } },
    ];
    const result = DaemonServer.consolidateEvents(events);
    expect(result).toEqual([
      { event: 'pty.data', params: { sessionId: 'a', data: 'hello world' } },
    ]);
  });

  it('does not merge pty.data events for different sessions', () => {
    const events = [
      { event: 'pty.data', params: { sessionId: 'a', data: 'aaa' } },
      { event: 'pty.data', params: { sessionId: 'b', data: 'bbb' } },
    ];
    const result = DaemonServer.consolidateEvents(events);
    expect(result).toEqual([
      { event: 'pty.data', params: { sessionId: 'a', data: 'aaa' } },
      { event: 'pty.data', params: { sessionId: 'b', data: 'bbb' } },
    ]);
  });

  it('preserves first-occurrence order for merged pty.data', () => {
    const events = [
      { event: 'pty.data', params: { sessionId: 'a', data: '1' } },
      { event: 'pty.data', params: { sessionId: 'b', data: '2' } },
      { event: 'pty.data', params: { sessionId: 'a', data: '3' } },
    ];
    const result = DaemonServer.consolidateEvents(events);
    expect(result).toEqual([
      { event: 'pty.data', params: { sessionId: 'a', data: '13' } },
      { event: 'pty.data', params: { sessionId: 'b', data: '2' } },
    ]);
  });

  it('does not merge non-pty.data events', () => {
    const events = [
      { event: 'pty.exit', params: { sessionId: 'a', exitCode: 0 } },
      { event: 'pty.exit', params: { sessionId: 'a', exitCode: 1 } },
    ];
    const result = DaemonServer.consolidateEvents(events);
    expect(result).toEqual(events);
  });

  it('preserves relative order of mixed event types', () => {
    const events = [
      { event: 'pty.data', params: { sessionId: 'a', data: 'chunk1' } },
      { event: 'session.statusChanged', params: { sessionId: 'a', status: 'RUNNING' } },
      { event: 'pty.data', params: { sessionId: 'a', data: 'chunk2' } },
      { event: 'pty.exit', params: { sessionId: 'a', exitCode: 0 } },
    ];
    const result = DaemonServer.consolidateEvents(events);
    expect(result).toEqual([
      { event: 'pty.data', params: { sessionId: 'a', data: 'chunk1chunk2' } },
      { event: 'session.statusChanged', params: { sessionId: 'a', status: 'RUNNING' } },
      { event: 'pty.exit', params: { sessionId: 'a', exitCode: 0 } },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(DaemonServer.consolidateEvents([])).toEqual([]);
  });

  it('passes through a single event unchanged', () => {
    const events = [{ event: 'pty.data', params: { sessionId: 'a', data: 'only' } }];
    const result = DaemonServer.consolidateEvents(events);
    expect(result).toEqual(events);
  });
});
