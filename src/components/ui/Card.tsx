import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-lg border border-gray-200 bg-white ${className}`} {...props} />;
}

interface CardHeaderProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  id?: string;
}

export function CardHeader({ title, subtitle, action, id }: CardHeaderProps) {
  return (
    <div className="flex min-h-[57px] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-gray-200 px-4 py-2.5">
      <div className="min-w-0">
        <h2 id={id} className="text-[13px] font-semibold text-gray-900">
          {title}
        </h2>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
