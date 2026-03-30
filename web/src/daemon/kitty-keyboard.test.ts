import { describe, it, expect } from 'vitest';
import { processTerminalProtocol } from './kitty-keyboard.js';

describe('processTerminalProtocol', () => {
  it('passes through data with no sequences unchanged', () => {
    const result = processTerminalProtocol('hello world');
    expect(result.output).toBe('hello world');
    expect(result.response).toBe('');
  });

  it('passes through empty data', () => {
    const result = processTerminalProtocol('');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });

  it('responds to query and strips it from output', () => {
    const result = processTerminalProtocol('\x1b[?u');
    expect(result.output).toBe('');
    expect(result.response).toBe('\x1b[?1u');
  });

  it('strips push sequence from output', () => {
    const result = processTerminalProtocol('\x1b[>1u');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });

  it('strips push sequence without flags', () => {
    const result = processTerminalProtocol('\x1b[>u');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });

  it('strips pop sequence from output', () => {
    const result = processTerminalProtocol('\x1b[<1u');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });

  it('strips pop sequence without flags', () => {
    const result = processTerminalProtocol('\x1b[<u');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });

  it('handles query embedded in other data', () => {
    const result = processTerminalProtocol('hello\x1b[?uworld');
    expect(result.output).toBe('helloworld');
    expect(result.response).toBe('\x1b[?1u');
  });

  it('handles multiple sequences in one chunk', () => {
    const result = processTerminalProtocol('\x1b[?u\x1b[>1u\x1b[<1u');
    expect(result.output).toBe('');
    expect(result.response).toBe('\x1b[?1u');
  });

  it('handles multiple queries in one chunk', () => {
    const result = processTerminalProtocol('\x1b[?u text \x1b[?u');
    expect(result.output).toBe(' text ');
    expect(result.response).toBe('\x1b[?1u\x1b[?1u');
  });

  it('preserves other escape sequences', () => {
    const data = '\x1b[32mgreen\x1b[0m';
    const result = processTerminalProtocol(data);
    expect(result.output).toBe(data);
    expect(result.response).toBe('');
  });

  it('handles push with multi-digit flags', () => {
    const result = processTerminalProtocol('\x1b[>31u');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });

  it('strips push sequence with disposition parameter', () => {
    // Extended format: \x1b[>flags;disposition u (e.g. set=1, or=2, not=3)
    const result = processTerminalProtocol('\x1b[>1;1u');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });

  it('strips push sequence with multi-digit disposition', () => {
    const result = processTerminalProtocol('\x1b[>31;2u');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });

  // modifyOtherKeys sequences
  it('strips modifyOtherKeys enable sequence', () => {
    const result = processTerminalProtocol('\x1b[>4;2m');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });

  it('strips modifyOtherKeys disable sequence', () => {
    const result = processTerminalProtocol('\x1b[>4m');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });

  it('strips modifyOtherKeys mixed with kitty sequences', () => {
    const result = processTerminalProtocol('\x1b[?u\x1b[>4;2m\x1b[>1u');
    expect(result.output).toBe('');
    expect(result.response).toBe('\x1b[?1u');
  });

  it('strips modifyOtherKeys embedded in other data', () => {
    const result = processTerminalProtocol('before\x1b[>4;2mafter');
    expect(result.output).toBe('beforeafter');
    expect(result.response).toBe('');
  });

  it('preserves normal SGR m sequences', () => {
    // \x1b[1m (bold) and \x1b[4m (underline) should NOT be stripped
    const data = '\x1b[1m\x1b[4m\x1b[31m';
    const result = processTerminalProtocol(data);
    expect(result.output).toBe(data);
    expect(result.response).toBe('');
  });
});
