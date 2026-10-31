import ExcelJS from 'exceljs';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '@/test/renderApp';
import { row, seed } from '@/test/fixtures';
import { sampleStore } from '@/lib/sampleStore';
import { readBoqWorkbook } from './readWorkbook';

const DPR = row({ voltage: '66 kV', capacity: '2x20 MVA', stream: 'Brownfield' });
const enc = encodeURIComponent(DPR.id);

async function boqWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Electrical');
  ws.addRow(['BOQ FOR KOGALI']);
  ws.addRow(['Sl No', 'Description', 'Unit', 'Qty', 'Supply rate', 'Supply amount']);
  ws.addRow(['1', 'Power transformer 20 MVA', 'Nos', 2, 31_247_000, 62_494_000]);
  ws.addRow(['2', 'LT cable 4C x 25 sq.mm', null, '100 Mtr', 866, 86_600]);
  ws.addRow(['3', 'Earthing', 'RMtr', 'LS', null, null]);
  ws.addRow([null, 'Total', null, null, null, 62_580_600]);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('BOQ import', () => {
  it('reads an .xlsx attached in Documents', async () => {
    seed([DPR]);
    renderAt(`/documents?dpr=${enc}`);
    const core = await screen.findByRole('region', { name: 'Core documents' });
    const input = within(core).getByTestId('core-file-input');
    await userEvent.click(within(core).getByRole('button', { name: 'Add files to Bill of Quantity (Electrical)' }));
    await userEvent.upload(input, new File([await boqWorkbook()], 'kogali-boq.xlsx'));
    expect(await screen.findByText('Read 3 items from kogali-boq.xlsx')).toBeInTheDocument();
    expect(sampleStore.boqReads(DPR.id)['bill-of-quantity-electrical']![0]!.items).toHaveLength(3);
  });

  it('blocks the import until every flagged row is fixed, confirmed or skipped, then replaces Part A', async () => {
    seed([DPR]);
    sampleStore.saveDocuments(DPR.id, { files: { 'bill-of-quantity-electrical': [{ name: 'kogali-boq.xlsx', size: 1, addedAt: '2026-10-31T00:00:00Z' }] }, notApplicable: [] });
    sampleStore.saveBoqRead(DPR.id, 'bill-of-quantity-electrical', await readBoqWorkbook(await boqWorkbook(), 'kogali-boq.xlsx', 'electrical'));
    renderAt(`/preparation?dpr=${enc}`);

    const inputs = await screen.findByRole('region', { name: 'Input documents' });
    expect(within(inputs).getByText('3 items read, 2 to check')).toBeInTheDocument();
    await userEvent.click(within(inputs).getByRole('button', { name: 'Review & import' }));

    const review = screen.getByRole('region', { name: 'Review BOQ import: kogali-boq.xlsx' });
    expect(within(review).getByText(/The total in the file matches the items read/)).toBeInTheDocument();
    const importBtn = within(review).getByRole('button', { name: /^Import 3 items, replacing/ });
    expect(importBtn).toBeDisabled();
    expect(within(review).getByRole('status')).toHaveTextContent('2 rows need attention');

    // Row 4 "100 Mtr": confirm the reading. Row 5 "LS": enter a quantity.
    expect(within(review).getByText('Quantity read from “100 Mtr” as 100')).toBeInTheDocument();
    await userEvent.click(within(review).getByRole('checkbox', { name: 'Checked, it’s right' }));
    expect(within(review).getByText('Quantity “LS” is not a number')).toBeInTheDocument();
    await userEvent.type(within(review).getByRole('spinbutton', { name: 'Quantity, row 5' }), '1');
    expect(within(review).getByRole('status')).toHaveTextContent('Every row is checked');

    await userEvent.click(importBtn);
    expect(screen.queryByRole('region', { name: /Review BOQ import/ })).not.toBeInTheDocument();
    const partA = screen.getByRole('region', { name: 'Electrical BOQ (Part A)' });
    expect(within(partA).getAllByRole('spinbutton', { name: /^Quantity of/ }).map((i) => (i as HTMLInputElement).value)).toEqual(['2', '100', '1']);
    expect(within(partA).getByText('From kogali-boq.xlsx · Electrical row 3')).toBeInTheDocument();
    await waitFor(() => expect(sampleStore.estimate(DPR.id)!.lines.filter((l) => l.section === 'electrical')).toHaveLength(3));
  });

  it('lets a flagged row be skipped instead', async () => {
    seed([DPR]);
    sampleStore.saveDocuments(DPR.id, { files: { 'bill-of-quantity-electrical': [{ name: 'kogali-boq.xlsx', size: 1, addedAt: '2026-10-31T00:00:00Z' }] }, notApplicable: [] });
    sampleStore.saveBoqRead(DPR.id, 'bill-of-quantity-electrical', await readBoqWorkbook(await boqWorkbook(), 'kogali-boq.xlsx', 'electrical'));
    renderAt(`/preparation?dpr=${enc}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Review & import' }));
    const review = screen.getByRole('region', { name: /Review BOQ import/ });
    await userEvent.click(within(review).getByRole('checkbox', { name: 'Skip row 4' }));
    await userEvent.click(within(review).getByRole('checkbox', { name: 'Skip row 5' }));
    expect(within(review).getByRole('button', { name: /^Import 1 items/ })).toBeEnabled();
  });
});
