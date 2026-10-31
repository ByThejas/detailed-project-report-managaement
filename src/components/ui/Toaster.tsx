import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { ToastContext, type ToastInput } from '@/lib/toast';

interface Toast extends Required<Pick<ToastInput, 'title' | 'tone'>> {
  id: number;
  description?: string;
}

const icons = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />,
  error: <XCircle className="h-4 w-4 text-rose-600" aria-hidden />,
  info: <Info className="h-4 w-4 text-gray-500" aria-hidden />,
};

const DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    ({ title, description, tone = 'success' }: ToastInput) => {
      const id = ++seq.current;
      setToasts((all) => [...all.slice(-2), { id, title, description, tone }]);
      timers.current.set(id, setTimeout(() => dismiss(id), DURATION_MS));
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex items-start gap-2.5 rounded-md border border-gray-200 bg-white px-3 py-2.5 shadow-md"
          >
            <span className="mt-px">{icons[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-gray-900">{t.title}</p>
              {t.description && <p className="mt-0.5 break-words text-xs text-gray-500">{t.description}</p>}
            </div>
            <button type="button" aria-label="Dismiss" className="text-gray-400 hover:text-gray-700" onClick={() => dismiss(t.id)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
