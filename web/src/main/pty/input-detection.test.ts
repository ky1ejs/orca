import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { InputDetector } from './input-detection.js';

describe('InputDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('detects prompt patterns after debounce', () => {
    const detector = new InputDetector();
    const onChange = vi.fn();
    detector.setOnChange(onChange);

    detector.onOutput('Do you want to continue? ');
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(detector.isWaiting()).toBe(true);

    detector.dispose();
  });

  it('detects (y/N) pattern', () => {
    const detector = new InputDetector();
    const onChange = vi.fn();
    detector.setOnChange(onChange);

    detector.onOutput('Proceed? (y/N) ');
    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledWith(true);

    detector.dispose();
  });

  it('detects > prompt pattern', () => {
    const detector = new InputDetector();
    const onChange = vi.fn();
    detector.setOnChange(onChange);

    detector.onOutput('Enter your input > ');
    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledWith(true);

    detector.dispose();
  });

  it('ignores normal output', () => {
    const detector = new InputDetector();
    const onChange = vi.fn();
    detector.setOnChange(onChange);

    detector.onOutput('Processing files...');
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
    expect(detector.isWaiting()).toBe(false);

    detector.dispose();
  });

  it('cancels debounce when non-matching output arrives', () => {
    const detector = new InputDetector();
    const onChange = vi.fn();
    detector.setOnChange(onChange);

    detector.onOutput('Continue? ');
    vi.advanceTimersByTime(200);
    detector.onOutput('Processing...');
    vi.advanceTimersByTime(500);

    expect(onChange).not.toHaveBeenCalled();
    expect(detector.isWaiting()).toBe(false);

    detector.dispose();
  });

  it('resets waiting state on non-matching output', () => {
    const detector = new InputDetector();
    const onChange = vi.fn();
    detector.setOnChange(onChange);

    // First become waiting
    detector.onOutput('Continue? ');
    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledWith(true);

    // Then receive normal output
    detector.onOutput('Done processing.');
    expect(onChange).toHaveBeenCalledWith(false);
    expect(detector.isWaiting()).toBe(false);

    detector.dispose();
  });

  it('dispose clears timers', () => {
    const detector = new InputDetector();
    const onChange = vi.fn();
    detector.setOnChange(onChange);

    detector.onOutput('Continue? ');
    detector.dispose();
    vi.advanceTimersByTime(1000);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('tracks last chunk', () => {
    const detector = new InputDetector();
    detector.onOutput('chunk 1');
    expect(detector.getLastChunk()).toBe('chunk 1');
    detector.onOutput('chunk 2');
    expect(detector.getLastChunk()).toBe('chunk 2');
    detector.dispose();
  });

  it('uses custom debounce time', () => {
    const detector = new InputDetector(undefined, 1000);
    const onChange = vi.fn();
    detector.setOnChange(onChange);

    detector.onOutput('Continue? ');
    vi.advanceTimersByTime(500);
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledWith(true);

    detector.dispose();
  });
});
