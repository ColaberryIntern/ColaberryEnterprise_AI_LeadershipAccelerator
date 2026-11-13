import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { setGlobalErrorHandler } from '../../utils/api';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  /**
   * `durationMs` is optional and defaults to the usual 4 seconds. It exists because some
   * notices are not acknowledgements: a save that half-succeeded (the row was written, a
   * secondary feature was refused) carries a sentence the reader has to actually finish, and
   * four seconds is not enough to read one and decide what to do about it.
   */
  showToast: (message: string, type?: ToastType, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

const DEFAULT_TOAST_MS = 4000;

export function useToast() {
  return useContext(ToastContext);
}

const TYPE_CLASSES: Record<ToastType, string> = {
  success: 'bg-success text-white',
  error: 'bg-danger text-white',
  warning: 'bg-warning text-dark',
  info: 'bg-info text-white',
};

let nextId = 0;

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback((
    message: string, type: ToastType = 'info', durationMs: number = DEFAULT_TOAST_MS,
  ) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    const timer = setTimeout(() => removeToast(id), durationMs);
    timersRef.current.set(id, timer);
  }, [removeToast]);

  // Register as global error handler for api.ts interceptor
  useEffect(() => {
    setGlobalErrorHandler((message: string) => {
      showToast(message, 'error');
    });
    return () => setGlobalErrorHandler(null);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="position-fixed bottom-0 end-0 p-3"
        style={{ zIndex: 1080, maxWidth: 400 }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast show mb-2 ${TYPE_CLASSES[toast.type]}`}
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            <div className="d-flex align-items-center p-3">
              <div className="flex-grow-1 small fw-medium">{toast.message}</div>
              <button
                type="button"
                className={`btn-close ${toast.type !== 'warning' ? 'btn-close-white' : ''} ms-2`}
                aria-label="Close"
                onClick={() => removeToast(toast.id)}
              />
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
