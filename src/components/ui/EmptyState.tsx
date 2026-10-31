import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  hint?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, hint, icon: Icon = Inbox, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      <Icon className="h-5 w-5 text-gray-400" strokeWidth={1.75} aria-hidden />
      <p className="mt-3 text-[13px] font-medium text-gray-900">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[13px] text-gray-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
