import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '@/test/renderApp';
import { row, seed } from '@/test/fixtures';

describe('Dashboard', () => {
  it('starts at zero with a call to create the first DPR', async () => {
    renderAt('/dashboard');
    const counts = await screen.findByRole('region', { name: 'DPR counts' });
    expect(within(counts).getByText('Total DPRs').nextSibling).toHaveTextContent('0');
    expect(screen.getByText('No DPRs yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create your first DPR' })).toHaveAttribute('href', '/initialization');
  });

  it('shows every pipeline stage, each linking to filtered reports', async () => {
    renderAt('/dashboard');
    const pipeline = await screen.findByRole('region', { name: 'Pipeline' });
    expect(within(pipeline).getAllByRole('listitem')).toHaveLength(6);
    expect(within(pipeline).getByRole('link', { name: /Under Approval/ })).toHaveAttribute('href', '/reports?stage=Under%20Approval');
  });

  it('summarises stored DPRs and filters the division table', async () => {
    seed([row({ id: 'a' }), row({ id: 'b', division: 'TUMKUR', stage: 'Generated' })]);
    renderAt('/dashboard');
    const counts = await screen.findByRole('region', { name: 'DPR counts' });
    expect(within(counts).getByText('Total DPRs').nextSibling).toHaveTextContent('2');

    await userEvent.type(screen.getByPlaceholderText('Filter divisions'), 'tum');
    const table = screen.getByRole('table');
    expect(within(table).getByRole('link', { name: 'TUMKUR' })).toHaveAttribute('href', '/reports?division=TUMKUR');
    expect(within(table).queryByText('PEENYA')).not.toBeInTheDocument();
  });

  it('shows only Dashboard, DPR Initialization, DPR Reports and Documents in the menu', async () => {
    renderAt('/dashboard');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Dashboard', 'DPR Initialization', 'DPR Reports', 'Documents']);
  });

  it('hides the sidebar with the toggle and remembers it', async () => {
    renderAt('/dashboard');
    await screen.findByRole('navigation', { name: 'Main' });
    // jsdom has no matchMedia, so the toggle acts as the mobile drawer; Ctrl+B is tested via storage.
    window.matchMedia = ((q: string) => ({ matches: q.includes('1024'), media: q }) as MediaQueryList) as typeof window.matchMedia;
    await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
    expect(screen.getByRole('complementary', { hidden: true, name: 'Sidebar' })).toHaveClass('hidden');
    expect(localStorage.getItem('dpr-manager.sidebar-collapsed')).toBe('true');
    await userEvent.keyboard('{Control>}b{/Control}');
    expect(localStorage.getItem('dpr-manager.sidebar-collapsed')).toBe('false');
  });

  it('sends the top search to the reports page', async () => {
    const router = renderAt('/dashboard');
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Search DPRs' }), 'channa{Enter}');
    expect(router.state.location.pathname).toBe('/reports');
    expect(router.state.location.search).toBe('?q=channa');
  });
});
