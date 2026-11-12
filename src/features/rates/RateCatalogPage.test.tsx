import ExcelJS from 'exceljs';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '@/test/renderApp';
import { loadRateCatalog, restoreBuiltInCatalog } from './catalog';
import { HEADERS } from './catalogFile';

beforeEach(() => restoreBuiltInCatalog());

async function catalogWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('By code');
  ws.addRow(HEADERS);
  ws.addRow(['1', null, 'POWER TRANSFORMER (2 items)']);
  ws.addRow(['1.11', 'Supply', '12.5 MVA, 66/11 kV transformer', 'Set', 21_500_000, 'p25']);
  ws.addRow([null, 'Labour', 'Assembly of transformer parts', 't', 1200, '9 b']);
  ws.addRow(['1.99', 'Supply', 'A new item for this quarter', 'No', 1000, 'p30']);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('Rate Catalog page', () => {
  it('is in the navigation and shows the built-in catalog', async () => {
    renderAt('/dashboard');
    await userEvent.click(await screen.findByRole('link', { name: 'Rate Catalog' }));
    const summary = await screen.findByRole('region', { name: 'Catalog summary' });
    await waitFor(() => expect(summary).toHaveTextContent('rate_catalog 76'));
    expect(summary).toHaveTextContent('Built-in (shipped with the app)');
  });

  it('saves a rate changed by hand, uses it for matching, and puts it back', async () => {
    renderAt('/rate-catalog');
    await screen.findByText('Built-in (shipped with the app)');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sheet' }), 'By code');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the catalog' }), '1.11');
    const supply = await screen.findByRole('textbox', { name: 'Supply rate, 1.11' }, { timeout: 5000 });
    await userEvent.clear(supply);
    await userEvent.type(supply, '21000000{Enter}');
    await waitFor(async () => expect((await loadRateCatalog()).items.find((i) => i.code === '1.11')!.rate).toBe(21_000_000));
    expect(screen.getByRole('region', { name: 'Catalog summary' })).toHaveTextContent('Rates changed by hand1');
    await userEvent.click(screen.getByRole('button', { name: 'Put back the rates of 1.11' }));
    await waitFor(async () => expect((await loadRateCatalog()).items.find((i) => i.code === '1.11')!.rate).toBe(20_715_000));
  }, 20000);

  it('replaces the catalog with an uploaded workbook after showing what changes, and goes back to the built-in one', async () => {
    renderAt('/rate-catalog');
    await screen.findByText('Built-in (shipped with the app)');
    await userEvent.upload(screen.getByLabelText('Rate catalog workbook'), new File([await catalogWorkbook()], 'rate_catalog 77.xlsx'));
    const preview = await screen.findByRole('region', { name: 'New catalog: rate_catalog 77.xlsx' });
    expect(preview).toHaveTextContent('2 items read from 1 sheets');
    expect(preview).toHaveTextContent('1 supply rate changes, 1 item is new');
    expect(within(preview).getByText('→ 2,15,00,000')).toBeInTheDocument();
    await userEvent.click(within(preview).getByRole('button', { name: 'Use this catalog' }));
    await waitFor(async () => expect((await loadRateCatalog()).source).toBe('rate_catalog 77.xlsx'));
    expect(screen.getByRole('region', { name: 'Catalog summary' })).toHaveTextContent('rate_catalog 77');

    await userEvent.click(screen.getByRole('button', { name: 'Go back to the built-in catalog' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, use the built-in catalog' }));
    await waitFor(async () => expect((await loadRateCatalog()).source).toBe('rate_catalog 76.xlsx'));
  });
});
