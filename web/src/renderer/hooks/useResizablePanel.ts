import { useCallback, useEffect, useRef, useState } from 'react';

interface UseResizablePanelOptions {
  height: number;
  onHeightChange: (height: number) => void;
  minHeight: number;
  maxHeightFraction: number;
}

interface UseResizablePanelResult {
  handleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
  };
  isDragging: boolean;
}

export function useResizablePanel({
  height,
  onHeightChange,
  minHeight,
  maxHeightFraction,
}: UseResizablePanelOptions): UseResizablePanelResult {
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const heightRef = useRef(height);
  heightRef.current = height;
  const onHeightChangeRef = useRef(onHeightChange);
  onHeightChangeRef.current = onHeightChange;

  const clamp = useCallback(
    (value: number) => Math.max(minHeight, Math.min(value, window.innerHeight * maxHeightFraction)),
    [minHeight, maxHeightFraction],
  );

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        const clamped = clamp(heightRef.current);
        if (clamped !== heightRef.current) {
          onHeightChangeRef.current(clamped);
        }
      }, 100);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (timeout) clearTimeout(timeout);
    };
  }, [clamp]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const delta = startYRef.current - e.clientY;
      const newHeight = clamp(startHeightRef.current + delta);
      onHeightChangeRef.current(newHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, clamp]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startYRef.current = e.clientY;
    startHeightRef.current = heightRef.current;
    setIsDragging(true);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  return { handleProps: { onMouseDown }, isDragging };
}
