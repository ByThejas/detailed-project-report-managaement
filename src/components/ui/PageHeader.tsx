import type { ReactNode } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** Page title row. Also sets the browser tab title. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  usePageTitle(title);
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-gray-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
