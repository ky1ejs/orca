import { createContext, useContext, useCallback, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'warning';
  autoDismissMs?: number;
}

interface ToastContextValue {
  addToast: (opts: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (opts: Omit<Toast, 'id'>): string => {
      const id = `toast-${++nextId}`;
      const toast: Toast = { ...opts, id };
      setToasts((prev) => [...prev, toast]);

      if (opts.autoDismissMs) {
        const timer = setTimeout(() => {
          removeToast(id);
        }, opts.autoDismissMs);
        timers.current.set(id, timer);
      }

      return id;
    },
    [removeToast],
  );

  // Cleanup timers on unmount
  useEffect(() => {
    const ref = timers.current;
    return () => {
      for (const timer of ref.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-center gap-3 rounded-md border px-4 py-3 shadow-lg ${
                toast.type === 'warning'
                  ? 'border-warning/30 bg-warning/10 text-warning'
                  : 'border-gray-700 bg-gray-800 text-white'
              }`}
            >
              <span className="text-body-sm">{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="ml-2 text-gray-400 hover:text-white"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
