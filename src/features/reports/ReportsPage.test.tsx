import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '@/test/renderApp';
import { row, seed } from '@/test/fixtures';
import { exportToExcel } from '@/lib/exportExcel';

vi.mock('@/lib/exportExcel', () => ({ exportToExcel: vi.fn().mockResolvedValue(undefined) }));

const register = () => screen.findByRole('region', { name: 'DPR report' });
const bodyRows = (card: HTMLElement) => within(within(card).getByRole('table')).getAllByRole('row').slice(1);

const rows = [
  row({ id: 'DPR/PEE/2026/0001', project: 'Hassan new S/S', stream: 'Greenfield' }),
  row({ id: 'DPR/TUM/2026/0002', project: 'Hassan augmentation', stream: 'Brownfield', division: 'TUMKUR', stage: 'Draft' }),
  row({ id: 'DPR/BEL/2026/0003', project: 'Belagavi bay', stream: 'Brownfield', division: 'BELGAUM' }),
];

describe('DPR Reports', () => {
  beforeEach(() => vi.mocked(exportToExcel).mockClear());

  it('starts empty, with Download disabled and a call to create a DPR', async () => {
    renderAt('/reports');
    const card = await register();
    expect(within(card).getByText('No DPRs yet', { selector: 'p.font-medium' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Download Excel' })).toBeDisabled();
    expect(within(card).getByRole('link', { name: 'Create your first DPR' })).toBeInTheDocument();
  });

  it('lists the programme reports', async () => {
    renderAt('/reports');
    const card = await screen.findByRole('region', { name: 'Programme reporting' });
    expect(within(card).getAllByRole('listitem')).toHaveLength(6);
  });

  it('filters by project type, stage and division', async () => {
    seed(rows);
    renderAt('/reports');
    const card = await register();
    await userEvent.selectOptions(within(card).getByRole('combobox', { name: 'Type' }), 'Brownfield');
    expect(bodyRows(card)).toHaveLength(2);
    await userEvent.selectOptions(within(card).getByRole('combobox', { name: 'Division' }), 'BELGAUM');
    expect(bodyRows(card)).toHaveLength(1);
    await userEvent.click(within(card).getByRole('button', { name: 'Clear filters' }));
    expect(bodyRows(card)).toHaveLength(3);
  });

  it('reads filters from the URL', async () => {
    seed(rows);
    renderAt('/reports?stage=Draft');
    const card = await register();
    expect(bodyRows(card)).toHaveLength(1);
    expect(within(card).getByRole('combobox', { name: 'Stage' })).toHaveValue('Draft');
  });

  it('combines search with other filters and offers to clear', async () => {
    seed(rows);
    renderAt('/reports');
    const card = await register();
    await userEvent.type(within(card).getByRole('searchbox', { name: 'Filter DPRs' }), 'hassan');
    expect(bodyRows(card)).toHaveLength(2);
    await userEvent.selectOptions(within(card).getByRole('combobox', { name: 'Division' }), 'BELGAUM');
    expect(within(card).getByText('No DPRs match these filters')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Download Excel' })).toBeDisabled();
  });

  it('downloads every row that matches the filters', async () => {
    seed(rows);
    renderAt('/reports?stream=Brownfield');
    const card = await register();
    await userEvent.click(within(card).getByRole('button', { name: 'Download Excel' }));

    expect(exportToExcel).toHaveBeenCalledTimes(1);
    const args = vi.mocked(exportToExcel).mock.calls[0]![0];
    expect(args.fileName).toMatch(/^DPR_Report_Brownfield_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(args.rows).toHaveLength(2);
    expect(await screen.findByText('Report downloaded')).toBeInTheDocument();
  });
});
