// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResizablePanel } from './useResizablePanel.js';

afterEach(() => {
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
    });
    const maxHeight = window.innerHeight * 0.8;
    expect(onHeightChange).toHaveBeenCalledWith(maxHeight);

    act(() => {
      fireMouseEvent('mouseup', -500);
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
