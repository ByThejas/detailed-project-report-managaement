import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}

export const ToastContext = createContext<(t: ToastInput) => void>(() => {});

/** Shows a short confirmation in the bottom-right corner. */
export const useToast = () => useContext(ToastContext);
