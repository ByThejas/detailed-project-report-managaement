import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';

export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <p className="num text-[13px] font-medium text-gray-500">404</p>
      <h1 className="mt-2 text-xl font-semibold text-gray-900">Page not found</h1>
      <p className="mt-1 text-[13px] text-gray-500">The page you opened does not exist or has moved.</p>
      <Link to="/dashboard" className="btn-primary mt-6">
        Back to dashboard
      </Link>
    </div>
  );
}
