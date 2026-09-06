/**
 * Toast — lightweight notifications. Wrap the app in <ToastProvider>,
 * then call const toast = useToast();  toast.success('saved').
 */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ToastContext = createContext(null);

const ICONS = {
  success: 'fas fa-circle-check',
  error: 'fas fa-circle-exclamation',
  info: 'fas fa-circle-info',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message, type = 'info', duration = 3200) => {
    const id = ++idRef.current;
    setToasts((list) => [...list, { id, message, type }]);
    if (duration) setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const api = {
    show: push,
    success: (m, d) => push(m, 'success', d),
    error: (m, d) => push(m, 'error', d ?? 4200),
    info: (m, d) => push(m, 'info', d),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="toast-viewport">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.type}`} onClick={() => dismiss(t.id)}>
              <i className={ICONS[t.type] || ICONS.info} />
              <span>{t.message}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
