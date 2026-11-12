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
  it('takes only the BOQ PDF in Documents and does not read workbooks there', async () => {
    seed([DPR]);
    renderAt(`/documents?dpr=${enc}`);
    const core = await screen.findByRole('region', { name: 'Core documents' });
    const input = within(core).getByTestId('core-file-input');
    await userEvent.click(within(core).getByRole('button', { name: 'Add files to Bill of Quantity (BOQ)' }));
    expect(input).toHaveAttribute('accept', 'application/pdf,.pdf');
    await userEvent.upload(input, new File([await boqWorkbook()], 'kogali-boq.xlsx'), { applyAccept: false });
    expect(await screen.findByText('PDF only')).toBeInTheDocument();
    expect(sampleStore.boqReads(DPR.id)['bill-of-quantity-electrical'] ?? []).toHaveLength(0);
  });

  it('reads an estimated BOQ uploaded in the Estimate tab', async () => {
    seed([DPR]);
    renderAt(`/preparation?dpr=${enc}`);
    await userEvent.click(await screen.findByRole('tab', { name: /Estimate/ }));
    const input = await screen.findByLabelText('Estimated BOQ workbook', { selector: 'input' });
    await userEvent.upload(input, new File([await boqWorkbook()], 'kogali-boq.xlsx'));
    expect(await screen.findByRole('region', { name: 'Review BOQ import: kogali-boq.xlsx' }, { timeout: 5000 })).toBeInTheDocument();
    expect(sampleStore.boqReads(DPR.id)['bill-of-quantity-electrical']![0]!.items).toHaveLength(3);
  });

  it('blocks the import until every flagged row is fixed, confirmed or skipped, then replaces Part A', async () => {
    seed([DPR]);
    sampleStore.saveDocuments(DPR.id, { files: { 'bill-of-quantity-electrical': [{ name: 'kogali-boq.xlsx', size: 1, addedAt: '2026-10-31T00:00:00Z' }] }, notApplicable: [] });
    sampleStore.saveBoqRead(DPR.id, 'bill-of-quantity-electrical', await readBoqWorkbook(await boqWorkbook(), 'kogali-boq.xlsx', 'electrical'));
    renderAt(`/preparation?dpr=${enc}`);
    await userEvent.click(await screen.findByRole('tab', { name: /Estimate/ }));

    const inputs = await screen.findByRole('region', { name: 'Upload BOQ estimate' });
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

  it('deletes an uploaded estimate so it no longer shows', async () => {
    seed([DPR]);
    sampleStore.saveBoqRead(DPR.id, 'bill-of-quantity-electrical', await readBoqWorkbook(await boqWorkbook(), 'kogali-boq.xlsx', 'electrical'));
    renderAt(`/preparation?dpr=${enc}`);
    await userEvent.click(await screen.findByRole('tab', { name: /Estimate/ }));
    const card = await screen.findByRole('region', { name: 'Upload BOQ estimate' });
    await userEvent.click(within(card).getByRole('button', { name: 'Delete kogali-boq.xlsx' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(within(card).queryByText('kogali-boq.xlsx')).not.toBeInTheDocument());
    expect(sampleStore.boqReads(DPR.id)['bill-of-quantity-electrical']).toHaveLength(0);
  });

  it('opens the Estimate step from the Upload BOQ estimate button', async () => {
    seed([DPR]);
    renderAt(`/preparation?dpr=${enc}`);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Upload BOQ estimate' }))[0]!);
    expect(await screen.findByRole('tab', { name: /Estimate/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Upload BOQ estimate' })).toBeInTheDocument();
  });

  it('shows quantity × rate amounts in the review and updates them when a quantity changes', async () => {
    seed([DPR]);
    sampleStore.saveBoqRead(DPR.id, 'bill-of-quantity-electrical', await readBoqWorkbook(await boqWorkbook(), 'kogali-boq.xlsx', 'electrical'));
    renderAt(`/preparation?dpr=${enc}`);
    await userEvent.click(await screen.findByRole('tab', { name: /Estimate/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Review & import' }));
    const review = screen.getByRole('region', { name: /Review BOQ import/ });
    expect(within(review).getByText('6,24,94,000')).toBeInTheDocument();
    const qty = within(review).getByRole('spinbutton', { name: 'Quantity, row 3' });
    await userEvent.clear(qty);
    await userEvent.type(qty, '3');
    expect(within(review).getByText('9,37,41,000')).toBeInTheDocument();
  });

  it('filters rows into fine, needs attention and not in the catalog, and imports only the catalog matches in one click', async () => {
    const PT = '12.5MVA, 66/11 kV Transformer : 3 Ph, 50 Hz, Core type, 2 winding Delta/Star, Vector Group: DYn11, OLTC, RTCC Panel, first filling of oil and 10% spare oil, complete with Terminal connector suitable for single Drake ACSR on primary side';
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Electrical');
    ws.addRow(['Sl No', 'Description', 'Unit', 'Qty', 'Supply rate', 'Supply amount']);
    ws.addRow(['1', PT, 'Nos', 1, 20_715_000, 20_715_000]);
    ws.addRow(['2', 'Painting of the control room walls', 'Sqm', 10, 50, 500]);
    ws.addRow(['3', 'Earthing', 'RMtr', 'LS', null, null]);
    seed([DPR]);
    sampleStore.saveBoqRead(DPR.id, 'bill-of-quantity-electrical', await readBoqWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer, 'mixed.xlsx', 'electrical'));
    renderAt(`/preparation?dpr=${enc}`);
    await userEvent.click(await screen.findByRole('tab', { name: /Estimate/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Review & import' }));
    const review = screen.getByRole('region', { name: /Review BOQ import/ });
    const show = within(review).getByRole('group', { name: 'Show rows' });
    await waitFor(() => expect(within(show).getByRole('button', { name: /^Fine/ })).toHaveTextContent('Fine1'), { timeout: 10000 });
    expect(within(show).getByRole('button', { name: /^Needs attention/ })).toHaveTextContent('Needs attention1');
    expect(within(show).getByRole('button', { name: /^Not in rate catalog/ })).toHaveTextContent('Not in rate catalog1');

    await userEvent.click(within(show).getByRole('button', { name: /^Fine/ }));
    expect(within(review).getByText(PT)).toBeInTheDocument();
    expect(within(review).queryByText('Earthing')).not.toBeInTheDocument();
    await userEvent.click(within(show).getByRole('button', { name: /^Needs attention/ }));
    expect(within(review).getByText('Earthing')).toBeInTheDocument();
    expect(within(review).queryByText(PT)).not.toBeInTheDocument();
    await userEvent.click(within(show).getByRole('button', { name: /^Not in rate catalog/ }));
    expect(within(review).getByText('Painting of the control room walls')).toBeInTheDocument();

    // The usual import is still blocked by the row with no quantity; the quick import is not.
    expect(within(review).getByRole('button', { name: /^Import 3 items/ })).toBeDisabled();
    const quick = within(review).getByRole('group', { name: 'Quick import' });
    expect(within(quick).getByRole('button', { name: 'Import all 2 rows' })).toBeEnabled();
    await userEvent.click(within(quick).getByRole('button', { name: 'Import only the 1 rows matching the rate catalog' }));
    await waitFor(() => expect(sampleStore.estimate(DPR.id)!.lines.filter((l) => l.section === 'electrical').map((l) => l.supplyRate)).toEqual([20_715_000]));
  }, 20000);

  it('imports every row with a quantity in one click, warnings taken as checked', async () => {
    seed([DPR]);
    sampleStore.saveBoqRead(DPR.id, 'bill-of-quantity-electrical', await readBoqWorkbook(await boqWorkbook(), 'kogali-boq.xlsx', 'electrical'));
    renderAt(`/preparation?dpr=${enc}`);
    await userEvent.click(await screen.findByRole('tab', { name: /Estimate/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Review & import' }));
    const quick = within(screen.getByRole('region', { name: /Review BOQ import/ })).getByRole('group', { name: 'Quick import' });
    expect(quick).toHaveTextContent('1 row with no quantity or description is left out');
    await userEvent.click(within(quick).getByRole('button', { name: 'Import all 2 rows' }));
    await waitFor(() => expect(sampleStore.estimate(DPR.id)!.lines.filter((l) => l.section === 'electrical').map((l) => l.qty)).toEqual([2, 100]));
  });

  it('shows the SoR rate beside a file rate that differs, and imports at the SoR rate', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Electrical');
    ws.addRow(['Sl No', 'Description', 'Unit', 'Qty', 'Supply rate', 'Supply amount']);
    ws.addRow(['1', '12.5MVA, 66/11 kV Transformer : 3 Ph, 50 Hz, Core type, 2 winding Delta/Star, Vector Group: DYn11, OLTC, RTCC Panel, first filling of oil and 10% spare oil, complete with Terminal connector suitable for single Drake ACSR on primary side', 'Nos', 1, 21_837_000, 21_837_000]);
    ws.addRow([null, 'Total', null, null, null, 21_837_000]);
    seed([DPR]);
    sampleStore.saveBoqRead(DPR.id, 'bill-of-quantity-electrical', await readBoqWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer, 'telagi.xlsx', 'electrical'));
    renderAt(`/preparation?dpr=${enc}`);
    await userEvent.click(await screen.findByRole('tab', { name: /Estimate/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Review & import' }));
    const review = screen.getByRole('region', { name: /Review BOQ import/ });
    const diff = await within(review).findByRole('status', { name: 'Rates that differ from the SoR' }, { timeout: 10000 });
    expect(diff).toHaveTextContent('file Rs 2,18,37,000, SoR 1.11 Rs 2,07,15,000');
    expect(within(review).getByText('SoR 1.11: 2,07,15,000')).toBeInTheDocument();
    await userEvent.click(within(review).getByRole('button', { name: /^Import 1 items/ }));
    await waitFor(() => expect(sampleStore.estimate(DPR.id)!.lines.find((l) => l.section === 'electrical')!.supplyRate).toBe(20_715_000));
  }, 20000);

  it('imports a row with no rate in the file at the SoR rate', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Electrical');
    ws.addRow(['Sl No', 'Description', 'Unit', 'Qty', 'Supply rate', 'Supply amount']);
    ws.addRow(['1', '12.5MVA, 66/11 kV Transformer : 3 Ph, 50 Hz, Core type, 2 winding Delta/Star, Vector Group: DYn11, OLTC, RTCC Panel, first filling of oil and 10% spare oil, complete with Terminal connector suitable for single Drake ACSR on primary side', 'Nos', 1, null, null]);
    seed([DPR]);
    sampleStore.saveBoqRead(DPR.id, 'bill-of-quantity-electrical', await readBoqWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer, 'quantities.xlsx', 'electrical'));
    renderAt(`/preparation?dpr=${enc}`);
    await userEvent.click(await screen.findByRole('tab', { name: /Estimate/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Review & import' }));
    const review = screen.getByRole('region', { name: /Review BOQ import/ });
    await within(review).findByRole('status', { name: 'Rows priced from the SoR' }, { timeout: 10000 });
    await userEvent.click(within(review).getByRole('button', { name: /^Import 1 items/ }));
    await waitFor(() => expect(sampleStore.estimate(DPR.id)!.lines.find((l) => l.section === 'electrical')!.supplyRate).toBe(20_715_000));
  }, 20000);

  it('downloads the imported items with their rates, and stops a download while the review is not imported', async () => {
    const green = row({ id: 'DPR/HAS/2026/0003', voltage: '66 kV', capacity: '2x8 MVA', stream: 'Greenfield' });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Sl No', 'Description', 'Unit', 'Qty', 'Supply rate', 'Supply amount', 'Erection rate', 'Erection amount', 'T&C rate', 'T&C amount']);
    ws.addRow(['1', 'Power transformer 20 MVA, 110/33-11 kV', 'No.', 2, 34_026_000, 68_052_000, 246_127, 492_254, 71_100, 142_200]);
    ws.addRow(['2', 'Nitrogen Injection Fire Protection System', 'No.', 2, 1_141_635, 2_283_270, null, null, null, null]);
    ws.addRow([null, 'Total', null, null, null, 70_335_270, null, 492_254, null, 142_200]);
    seed([green]);
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), 'blob:x'));
    URL.revokeObjectURL = vi.fn();
    renderAt(`/preparation?dpr=${encodeURIComponent(green.id)}`);
    await userEvent.click(await screen.findByRole('tab', { name: /Estimate/ }));
    const input = await screen.findByLabelText('Estimated BOQ workbook', { selector: 'input' });
    await userEvent.upload(input, new File([(await wb.xlsx.writeBuffer()) as ArrayBuffer], 'hassan.xlsx'));
    const review = await screen.findByRole('region', { name: 'Review BOQ import: hassan.xlsx' }, { timeout: 5000 });

    await userEvent.click(screen.getByRole('button', { name: 'Download Excel' }));
    expect(screen.getByRole('alertdialog', { name: 'Import before downloading' })).toHaveTextContent('hassan.xlsx is still under review');
    expect(blobs).toHaveLength(0);

    await userEvent.click(within(review).getByRole('button', { name: /^Import 2 items/ }));
    expect(screen.queryByRole('alertdialog', { name: 'Import before downloading' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Download Excel' }));
    await waitFor(() => expect(blobs).toHaveLength(1), { timeout: 10000 });
    const out = new ExcelJS.Workbook();
    await out.xlsx.load(await new Promise<ArrayBuffer>((ok) => {
      const r = new FileReader();
      r.onload = () => ok(r.result as ArrayBuffer);
      r.readAsArrayBuffer(blobs[0]!);
    }));
    const part = out.getWorksheet('Part A Electrical')!;
    const values: unknown[] = [];
    part.eachRow((r) => r.eachCell((c) => values.push(typeof c.value === 'object' && c.value && 'result' in c.value ? c.value.result : c.value)));
    expect(values).toEqual(expect.arrayContaining([34_026_000, 68_052_000, 246_127, 492_254, 71_100, 1_141_635]));
  }, 30000);

  it('lets a flagged row be skipped instead', async () => {
    seed([DPR]);
    sampleStore.saveDocuments(DPR.id, { files: { 'bill-of-quantity-electrical': [{ name: 'kogali-boq.xlsx', size: 1, addedAt: '2026-10-31T00:00:00Z' }] }, notApplicable: [] });
    sampleStore.saveBoqRead(DPR.id, 'bill-of-quantity-electrical', await readBoqWorkbook(await boqWorkbook(), 'kogali-boq.xlsx', 'electrical'));
    renderAt(`/preparation?dpr=${enc}`);
    await userEvent.click(await screen.findByRole('tab', { name: /Estimate/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Review & import' }));
    const review = screen.getByRole('region', { name: /Review BOQ import/ });
    await userEvent.click(within(review).getByRole('checkbox', { name: 'Skip row 4' }));
    await userEvent.click(within(review).getByRole('checkbox', { name: 'Skip row 5' }));
    expect(within(review).getByRole('button', { name: /^Import 1 items/ })).toBeEnabled();
  });

  it('imports a KPTCL workbook with line works: each sheet to its part, misc amounts and the line abstract charges', async () => {
    const wb = new ExcelJS.Workbook();
    const ss = wb.addWorksheet('SS Supply & Erection');
    ss.addRow(['Sl No', 'Description', 'Unit', 'Qty', 'Supply rate', 'Supply amount']);
    ss.addRow(['1', 'Power transformer 20 MVA', 'Nos', 1, 31_247_000, 31_247_000]);
    ss.addRow([null, 'Sub-Total', null, null, null, 31_247_000]);
    ss.addRow([null, 'Miscellaneous', null, null, null, 253_000]);
    ss.addRow([null, 'Total', null, null, null, 31_500_000]);
    const line = wb.addWorksheet('Line Supply');
    line.addRow(['Sl No', 'Description', 'Unit', 'Qty', 'Material rate', 'Material amount', 'Labour rate', 'Labour amount']);
    line.addRow(['1', 'Coyote ACSR conductor', 'Km', 1, 139_000, 139_000, 8_000, 8_000]);
    line.addRow([null, 'Sub-Total', null, null, null, 139_000, null, 8_000]);
    line.addRow([null, 'Miscellaneous', null, null, null, 11_000, null, 2_000]);
    line.addRow([null, 'Total', null, null, null, 150_000, null, 10_000]);
    const abs = wb.addWorksheet('TL ABS');
    abs.addRow(['Construction of 66kV LILO line']);
    abs.addRow(['Sl No', 'Description', 'Amount in Rs.']);
    abs.addRow([1, 'Material Cost', 150_000]);
    abs.addRow([2, 'Labour/Erection Charges', 10_000]);
    abs.addRow([4, 'Basic Rate (Sum of Sl No. 1 to 3)', 160_000]);
    abs.addRow([5, 'Area specifics loading on Basic Rates', 4_800]);
    abs.addRow([6, 'Applicable GST on Sl No. 4 & 5', 29_664]);
    abs.addRow([8, 'Statutory charges such as PTCC', 100_000]);
    abs.addRow([9, 'Forest Clearence, Tree/Crop Cut Compensation', 50_000]);
    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    seed([DPR]);
    sampleStore.saveDocuments(DPR.id, { files: { 'bill-of-quantity-electrical': [{ name: 'estimate.xlsx', size: 1, addedAt: '2026-11-02T00:00:00Z' }] }, notApplicable: [] });
    sampleStore.saveBoqRead(DPR.id, 'bill-of-quantity-electrical', await readBoqWorkbook(buffer, 'estimate.xlsx', 'electrical'));
    renderAt(`/preparation?dpr=${enc}`);
    await userEvent.click(await screen.findByRole('tab', { name: /Estimate/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Review & import' }));
    const review = screen.getByRole('region', { name: 'Review BOQ import: estimate.xlsx' });
    expect(within(review).getByText(/→ Line supply & erection/)).toBeInTheDocument();
    expect(within(review).getByText(/Area loading 3% and GST 18%/)).toBeInTheDocument();
    expect(within(review).getByText(/Line works charges from “TL ABS”: statutory Rs 1,00,000, forest\/tree\/crop Rs 50,000/)).toBeInTheDocument();

    await userEvent.click(within(review).getByRole('button', { name: /^Import 2 items/ }));
    expect(within(screen.getByRole('region', { name: 'Line works: supply & erection' })).getByDisplayValue('Coyote ACSR conductor')).toBeInTheDocument();
    const lineAbstract = screen.getByRole('region', { name: 'Abstract: line works' });
    // 1.6 lakh basic + 3% + 18% GST = 1.9446, + 1.0 statutory + 0.5 compensation = 3.4446.
    expect(within(lineAbstract).getByText('Total estimate cost (7 to 10)').closest('tr')).toHaveTextContent('3.44');
    expect(within(screen.getByRole('region', { name: 'General abstract' })).getByText('Line works')).toBeInTheDocument();
    await waitFor(() => expect(sampleStore.estimate(DPR.id)!.misc).toMatchObject({ supply: 253_000, lineSupply: 11_000, lineErection: 2_000 }));
    expect(sampleStore.estimate(DPR.id)!.areaLoadingPct).toBe(3);
  });
});
