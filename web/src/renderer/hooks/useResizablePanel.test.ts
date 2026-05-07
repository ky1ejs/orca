// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResizablePanel } from './useResizablePanel.js';

// Queue rAF callbacks to mirror real browser semantics — the callback runs
// after requestAnimationFrame returns, not during the call. flushFrames()
// drains the queue when a test wants the scheduled work to run.
type RafEntry = { id: number; cb: FrameRequestCallback };
let rafQueue: RafEntry[] = [];
let nextRafId = 1;

function flushFrames() {
  const entries = rafQueue;
  rafQueue = [];
  entries.forEach(({ cb }) => cb(performance.now()));
}

beforeEach(() => {
  rafQueue = [];
  nextRafId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextRafId++;
    rafQueue.push({ id, cb });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    const idx = rafQueue.findIndex((e) => e.id === id);
    if (idx !== -1) rafQueue.splice(idx, 1);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fireMouseEvent(type: 'mousedown' | 'mousemove' | 'mouseup', clientY: number) {
  const event = new MouseEvent(type, { clientY, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

describe('useResizablePanel', () => {
  const defaultOpts = {
    height: 320,
    onHeightChange: vi.fn(),
    minHeight: 120,
    maxHeightFraction: 0.8,
  };

  it('starts with isDragging false', () => {
    const { result } = renderHook(() => useResizablePanel(defaultOpts));
    expect(result.current.isDragging).toBe(false);
  });

  it('sets isDragging on mousedown and clears on mouseup', () => {
    const { result } = renderHook(() => useResizablePanel(defaultOpts));

    act(() => {
      result.current.handleProps.onMouseDown({
        clientY: 500,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      fireMouseEvent('mouseup', 500);
    });
    expect(result.current.isDragging).toBe(false);
  });

  it('calls onHeightChange during drag', () => {
    const onHeightChange = vi.fn();
    const { result } = renderHook(() => useResizablePanel({ ...defaultOpts, onHeightChange }));

    // Start drag at y=500 with height=320
    act(() => {
      result.current.handleProps.onMouseDown({
        clientY: 500,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    // Move mouse up by 50px (y=450) → height should increase by 50
    act(() => {
      fireMouseEvent('mousemove', 450);
      flushFrames();
    });
    expect(onHeightChange).toHaveBeenCalledWith(370);

    act(() => {
      fireMouseEvent('mouseup', 450);
    });
  });

  it('clamps height to minHeight', () => {
    const onHeightChange = vi.fn();
    const { result } = renderHook(() =>
      useResizablePanel({ ...defaultOpts, height: 150, onHeightChange }),
    );

    act(() => {
      result.current.handleProps.onMouseDown({
        clientY: 500,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    // Move mouse down by 200px → height would be -50, should clamp to minHeight
    act(() => {
      fireMouseEvent('mousemove', 700);
      flushFrames();
    });
    expect(onHeightChange).toHaveBeenCalledWith(120);

    act(() => {
      fireMouseEvent('mouseup', 700);
    });
  });

  it('clamps height to maxHeightFraction of viewport', () => {
    // jsdom defaults window.innerHeight to 768
    const onHeightChange = vi.fn();
    const { result } = renderHook(() => useResizablePanel({ ...defaultOpts, onHeightChange }));

    act(() => {
      result.current.handleProps.onMouseDown({
        clientY: 500,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    // Move mouse up by 1000px → height would be 1320, should clamp
    act(() => {
      fireMouseEvent('mousemove', -500);
      flushFrames();
    });
    const maxHeight = window.innerHeight * 0.8;
    expect(onHeightChange).toHaveBeenCalledWith(maxHeight);

    act(() => {
      fireMouseEvent('mouseup', -500);
    });
  });

  it('coalesces multiple mousemove events into one onHeightChange per frame', () => {
    const onHeightChange = vi.fn();
    const { result } = renderHook(() => useResizablePanel({ ...defaultOpts, onHeightChange }));

    act(() => {
      result.current.handleProps.onMouseDown({
        clientY: 500,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });

    act(() => {
      fireMouseEvent('mousemove', 480); // delta=20 → 340
      fireMouseEvent('mousemove', 460); // delta=40 → 360
      fireMouseEvent('mousemove', 440); // delta=60 → 380
    });
    expect(onHeightChange).not.toHaveBeenCalled();

    act(() => {
      flushFrames();
    });
    expect(onHeightChange).toHaveBeenCalledTimes(1);
    expect(onHeightChange).toHaveBeenCalledWith(380);

    act(() => {
      fireMouseEvent('mouseup', 440);
    });
  });

  it('restores body styles on mouseup', () => {
    const { result } = renderHook(() => useResizablePanel(defaultOpts));

    act(() => {
      result.current.handleProps.onMouseDown({
        clientY: 500,
        preventDefault: vi.fn(),
      } as unknown as React.MouseEvent);
    });
    expect(document.body.style.cursor).toBe('row-resize');
    expect(document.body.style.userSelect).toBe('none');

    act(() => {
      fireMouseEvent('mouseup', 500);
    });
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });
});
