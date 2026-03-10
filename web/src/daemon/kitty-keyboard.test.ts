import { describe, it, expect } from 'vitest';
import { processKittyKeyboard } from './kitty-keyboard.js';

describe('processKittyKeyboard', () => {
  it('passes through data with no sequences unchanged', () => {
    const result = processKittyKeyboard('hello world');
    expect(result.output).toBe('hello world');
    expect(result.response).toBe('');
  });

  it('passes through empty data', () => {
    const result = processKittyKeyboard('');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });

  it('responds to query and strips it from output', () => {
    const result = processKittyKeyboard('\x1b[?u');
    expect(result.output).toBe('');
    expect(result.response).toBe('\x1b[?1u');
  });

  it('strips push sequence from output', () => {
    const result = processKittyKeyboard('\x1b[>1u');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });

  it('strips push sequence without flags', () => {
    const result = processKittyKeyboard('\x1b[>u');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });

  it('strips pop sequence from output', () => {
    const result = processKittyKeyboard('\x1b[<1u');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });

  it('strips pop sequence without flags', () => {
    const result = processKittyKeyboard('\x1b[<u');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });

  it('handles query embedded in other data', () => {
    const result = processKittyKeyboard('hello\x1b[?uworld');
    expect(result.output).toBe('helloworld');
    expect(result.response).toBe('\x1b[?1u');
  });

  it('handles multiple sequences in one chunk', () => {
    const result = processKittyKeyboard('\x1b[?u\x1b[>1u\x1b[<1u');
    expect(result.output).toBe('');
    expect(result.response).toBe('\x1b[?1u');
  });

  it('handles multiple queries in one chunk', () => {
    const result = processKittyKeyboard('\x1b[?u text \x1b[?u');
    expect(result.output).toBe(' text ');
    expect(result.response).toBe('\x1b[?1u\x1b[?1u');
  });

  it('preserves other escape sequences', () => {
    const data = '\x1b[32mgreen\x1b[0m';
    const result = processKittyKeyboard(data);
    expect(result.output).toBe(data);
    expect(result.response).toBe('');
  });

  it('handles push with multi-digit flags', () => {
    const result = processKittyKeyboard('\x1b[>31u');
    expect(result.output).toBe('');
    expect(result.response).toBe('');
  });
});
