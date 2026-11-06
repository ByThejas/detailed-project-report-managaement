import { lazy, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * A page loaded on first visit, so the app opens without downloading every page's code. Once loaded (or
 * preloaded) it renders straight away; until then the layout's Suspense shows a short "Loading" line.
 */
function page<M>(load: () => Promise<M>, pick: (m: M) => ComponentType) {
  let loaded: ComponentType | null = null;
  const preload = () => load().then((m) => (loaded = pick(m)));
  const Lazy = lazy(() => preload().then((C) => ({ default: C })));
  function Page() {
    const C = loaded;
    return C ? <C /> : <Lazy />;
  }
  return Object.assign(Page, { preload });
}

const pages = {
  dashboard: page(() => import('@/features/dashboard/DashboardPage'), (m) => m.DashboardPage),
  initialization: page(() => import('@/features/initialization/InitializationPage'), (m) => m.InitializationPage),
  reports: page(() => import('@/features/reports/ReportsPage'), (m) => m.ReportsPage),
  documents: page(() => import('@/features/documents/DocumentsPage'), (m) => m.DocumentsPage),
  preparation: page(() => import('@/features/preparation/DprPreparationPage'), (m) => m.DprPreparationPage),
};

/** Loads every page's code now, e.g. before tests render synchronously. */
export const preloadPages = () => Promise.all(Object.values(pages).map((p) => p.preload()));

const { dashboard: Dashboard, initialization: Initialization, reports: Reports, documents: Documents, preparation: Preparation } = pages;

export const routes = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'initialization', element: <Initialization /> },
      { path: 'reports', element: <Reports /> },
      { path: 'documents', element: <Documents /> },
      { path: 'preparation', element: <Preparation /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const routerFuture = {
  v7_fetcherPersist: true,
  v7_normalizeFormMethod: true,
  v7_partialHydration: true,
  v7_relativeSplatPath: true,
  v7_skipActionErrorRevalidation: true,
} as const;

export const router = createBrowserRouter(routes, { future: routerFuture });
