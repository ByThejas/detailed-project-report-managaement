import { existsSync, readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '@/test/renderApp';
import { row, seed } from '@/test/fixtures';
import { sampleStore } from '@/lib/sampleStore';

async function workbook(abstractTotal: number) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('SS Supply & Erection');
  ws.addRow(['Sl No', 'Description', 'Unit', 'Qty', 'Supply rate', 'Supply amount']);
  ws.addRow(['A1', 'Power transformer 20 MVA, 66/11 kV', 'No', 1, 31_247_000, 31_247_000]);
  ws.addRow(['A2', 'Lightning arrester 66 kV', 'No', 6, 50_000, 300_000]);
  ws.addRow([null, 'Total', null, null, null, 31_547_000]);
  const abs = wb.addWorksheet('SS ABS');
  abs.addRow(['ABSTRACT-I']);
  abs.addRow([1, 'Material Cost', abstractTotal === 0 ? 0 : 31_547_000]);
  abs.addRow([4, 'Basic Rate', 31_547_000]);
  abs.addRow([11, 'Total Cost of Estimate', abstractTotal]);
  return new File([(await wb.xlsx.writeBuffer()) as ArrayBuffer], 'test-boq.xlsx');
}

const upload = async (file: File) => userEvent.upload(screen.getByLabelText('Workbook to test'), file);

describe('BOQ test bench', () => {
  it('is in the nav bar and needs no DPR', async () => {
    renderAt('/boq-test');
    expect(await screen.findByText('Nothing imported yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'BOQ test bench (temp)' })).toBeInTheDocument();
  });

  it('tests one workbook against its own totals, and a new version replaces the last without touching any DPR', { timeout: 20000 }, async () => {
    const dpr = row({ capacity: '1x20 MVA', voltage: '66 kV' });
    seed([dpr]);
    renderAt('/boq-test');
    await screen.findByText('Nothing imported yet');

    // With the default 5% loading, 18% GST and Rs 50,000 statutory the app works out Rs 3,91,36,733. A wrong stated total is flagged.
    await upload(await workbook(40_000_000));
    await userEvent.click(await screen.findByRole('button', { name: /^Import 2 items/ }, { timeout: 5000 }));
    const compare = screen.getByRole('region', { name: 'Compared with the workbook' });
    expect(within(compare).getByText('-8.63')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Checks' })).getByText(/Abstract-I comes to/)).toBeInTheDocument();

    await upload(await workbook(39_136_733));
    await userEvent.click(await screen.findByRole('button', { name: /^Import 2 items/ }, { timeout: 5000 }));
    expect(within(screen.getByRole('region', { name: 'Compared with the workbook' })).getByText('Matches')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Electrical BOQ (Part A)' })).getAllByDisplayValue(/Power transformer/)).toHaveLength(1);

    // No DPR got an estimate from the bench.
    expect(sampleStore.estimate(dpr.id)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Clear the bench' }));
    expect(screen.getByText('Nothing imported yet')).toBeInTheDocument();
  });

  const real = 'fixtures/private/thyavanige.xlsx';
  it.skipIf(!existsSync(real))('comes to Rs 1273.17 lakh on the real Thyavanige workbook', async () => {
    renderAt('/boq-test');
    await upload(new File([new Uint8Array(readFileSync(real))], 'thyavanige.xlsx'));
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm all warnings' }, { timeout: 10000 }));
    await userEvent.click(screen.getByRole('button', { name: /^Import \d+ items/ }));
    const results = screen.getByRole('region', { name: 'Test results' });
    expect(within(results).getByText('1,273.17')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Compared with the workbook' })).getAllByText('Matches')).toHaveLength(2);
  }, 30000);
});
