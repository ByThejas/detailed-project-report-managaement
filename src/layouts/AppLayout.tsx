import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PanelLeft, Search, X } from 'lucide-react';
import logoUrl from '@/assets/prasanna-logo.png';
import { navigation } from '@/config/navigation';
import { APP_VERSION } from '@/config/app';
import { useCurrentUser } from '@/lib/session';
import { usePersistentState } from '@/hooks/usePersistentState';
import { ToastProvider } from '@/components/ui/Toaster';

const DESKTOP = '(min-width: 1024px)';
const isDesktop = () => typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP).matches;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useCurrentUser();
  return (
    <div className="flex h-full w-60 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-14 shrink-0 items-center px-4">
        <img src={logoUrl} alt="Prasanna" className="h-7 w-auto" />
      </div>

      <nav aria-label="Main" className="flex-1 px-2 py-3">
        <ul className="space-y-px">
          {navigation.map(({ label, path, icon: Icon }) => (
            <li key={path}>
              <NavLink
                to={path}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors ${
                    isActive ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                <Icon className="h-4 w-4 text-gray-500" strokeWidth={1.75} aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex items-center gap-2.5 border-t border-gray-200 px-4 py-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gray-100 text-2xs font-medium text-gray-700" aria-hidden>
          {initials(user.displayName)}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-medium text-gray-900">{user.displayName}</p>
          <p className="truncate text-xs text-gray-500">
            {user.organisation} · v{APP_VERSION}
          </p>
        </div>
      </div>
    </div>
  );
}

function TopSearch() {
  const navigate = useNavigate();
  const ref = useRef<HTMLInputElement>(null);

  // "/" focuses the search, as in most admin tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = ref.current?.value.trim() ?? '';
    navigate(q ? `/reports?q=${encodeURIComponent(q)}` : '/reports');
    ref.current?.blur();
  };

  return (
    <form role="search" onSubmit={submit} className="relative ml-auto hidden w-64 sm:block">
      <label htmlFor="global-search" className="sr-only">
        Search DPRs
      </label>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden />
      <input ref={ref} id="global-search" type="search" placeholder="Search DPRs" className="input pl-8 pr-8" />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-gray-200 px-1 text-2xs text-gray-400">
        /
      </kbd>
    </form>
  );
}

/** App frame: collapsible sidebar (drawer on small screens), slim top bar, scrolling content. */
export function AppLayout() {
  const [collapsed, setCollapsed] = usePersistentState('dpr-manager.sidebar-collapsed', false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const current = navigation.find((n) => pathname.startsWith(n.path));

  const toggle = () => (isDesktop() ? setCollapsed((c) => !c) : setDrawerOpen((o) => !o));

  // Ctrl+B / Cmd+B toggles the sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Drawer: close on Escape, keep focus inside while open.
  useEffect(() => {
    if (!drawerOpen) return;
    const panel = drawerRef.current;
    panel?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
      if (e.key !== 'Tab' || !panel) return;
      const items = panel.querySelectorAll<HTMLElement>('a, button');
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <ToastProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-[13px] focus:shadow-md"
      >
        Skip to content
      </a>

      <div className="flex h-full">
        <aside className={collapsed ? 'hidden' : 'hidden shrink-0 lg:block'} aria-label="Sidebar">
          <Sidebar />
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-gray-900/20" aria-hidden onClick={() => setDrawerOpen(false)} />
            <div ref={drawerRef} className="relative h-full w-60 shadow-xl">
              <Sidebar onNavigate={() => setDrawerOpen(false)} />
              <button type="button" aria-label="Close menu" onClick={() => setDrawerOpen(false)} className="btn-ghost absolute right-2 top-3 h-8 w-8 px-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 sm:px-4">
            <button
              type="button"
              onClick={toggle}
              aria-label="Toggle sidebar"
              title="Toggle sidebar (Ctrl+B)"
              className="btn-ghost h-8 w-8 px-0"
            >
              <PanelLeft className="h-4 w-4" strokeWidth={1.75} />
            </button>
            {collapsed && <img src={logoUrl} alt="" className="hidden h-6 w-auto lg:block" aria-hidden />}
            <span className="h-4 w-px bg-gray-200" aria-hidden />
            <nav aria-label="Breadcrumb" className="min-w-0 truncate text-[13px]">
              <span className="text-gray-500">KPTCL</span>
              {current && (
                <>
                  <span className="mx-1.5 text-gray-300">/</span>
                  <span className="font-medium text-gray-900" aria-current="page">
                    {current.label}
                  </span>
                </>
              )}
            </nav>
            <TopSearch />
          </header>

          <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto focus:outline-none">
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
