import { amountFactor, effectiveRate, lineAmounts, sectionTotals } from '@/features/preparation/calc';
import type { EstimateLine } from '@/features/preparation/types';
import { buildTemplate } from '@/features/preparation/template';
import { applySuggestion, type RateSuggestion } from '@/features/rates/match';
import { itemAmount, parseBoq } from './parse';
import { applyImport, planImport } from './toEstimateLine';
import type { Cell, SheetGrid } from './types';

const grid = (name: string, rows: Cell[][]): SheetGrid => ({ name, rows });
const importAll = (sheets: SheetGrid[]) => {
  const read = parseBoq(sheets, 'est.xlsx', 'electrical');
  return { read, plan: planImport(read, read.items, new Set(read.sheets.filter((s) => s.includedByDefault && s.headerRow).map((s) => s.name)), false) };
};

describe('an uploaded estimate comes in with exactly its own rates and amounts', () => {
  it('keeps a per-MT erection rate and the amount worked on the weight', () => {
    const { plan } = importAll([
      grid('Materials', [
        ['Sl No', 'Description', 'Unit', 'Qty', 'Supply rate', 'Supply amount', 'Erection rate', 'Erection amount'],
        ['1', 'CTs 66 kV (0.158 t per structure)', 'No', 3, 12_000, 36_000, 5_723, 2_712.702],
        [null, 'Total', null, null, null, 36_000, null, 2_712.702],
      ]),
    ]);
    const [l] = plan.lines;
    expect(l).toMatchObject({ qty: 3, supplyRate: 12_000, erectionRate: 5_723 });
    expect(lineAmounts(l!)).toEqual({ supply: 36_000, erection: 2_712.702, testing: 0 });
    expect(amountFactor(l!, 'erection')).toBeCloseTo(0.158, 6);
    // A changed quantity keeps the file's working: 0.158 t per structure × Rs 5,723.
    expect(lineAmounts({ ...l!, qty: 4 }).erection).toBeCloseTo(3_616.94, 2);
    // A changed rate is still per tonne, as in the file.
    expect(lineAmounts({ ...l!, erectionRate: 6_000 }).erection).toBeCloseTo(2_844, 2);
    expect(effectiveRate(l!, 'erection')).toBeCloseTo(904.23, 2);
  });

  it('keeps a rounded amount as written, and a rate whose amount the file leaves out', () => {
    const { plan } = importAll([
      grid('Materials', [
        ['Sl No', 'Description', 'Unit', 'Qty', 'Supply rate', 'Supply amount', 'Erection rate', 'Erection amount'],
        ['1', 'Lightning arrester 60 kV', 'No', 3, 30_000, 90_000, 244.33, 733],
        ['2', 'Installing insulator strings', 'No', 4, 139_000, null, 500, 2_000],
      ]),
    ]);
    expect(lineAmounts(plan.lines[0]!).erection).toBe(733);
    expect(plan.lines[1]).toMatchObject({ supplyRate: 139_000, erectionRate: 500 });
    expect(lineAmounts(plan.lines[1]!)).toEqual({ supply: 0, erection: 2_000, testing: 0 });
  });

  it('reads the count under "Nos" when TOTAL Quantity is blank, and a quantity written one column right of "Qty"', () => {
    const { read } = importAll([
      grid('Line Supply&Erection', [
        ['Sl. No.', 'Description', 'Unit', 'Nos', 'Unit Weight', 'TOTAL Quantity', 'Material Cost', null, 'Labour /Erection Cost', null],
        [null, null, null, null, null, null, 'Rate', 'Amount', 'Rate', 'Amount'],
        [null, '(ia) 110kV Towers', 'Nos', 61, null, null, null, null, 927, 56_547],
      ]),
      grid('Dis Esti', [
        ['Sl. No.', 'Description', 'Unit', 'Qty', null, 'Unit Rate (in Rs.)', 'Amount (in Rs.)'],
        [5, 'Releasing of 11kv CTs', 'Nos.', null, 6, 733, 4_398],
      ]),
    ]);
    const tower = read.items.find((i) => i.description.includes('110kV Towers'))!;
    expect(tower).toMatchObject({ qty: 61, erectionRate: 927 });
    expect(itemAmount(tower, 'erection')).toBe(56_547);
    const ct = read.items.find((i) => i.description.includes('Releasing'))!;
    expect(ct).toMatchObject({ qty: 6, supplyRate: 733 });
  });

  it('reads a "Mise & unforseen" row as the miscellaneous amount, so the total is the file\'s', () => {
    const { read, plan } = importAll([
      grid('Civil', [
        ['Sl.No.', 'Specifications', 'Unit', 'Qty.', 'Rate', 'Amount'],
        [1, 'Earth work excavation', 'Cum', 100, 2_794.1035, 279_410.35],
        [null, 'Sub-Total', null, null, null, 279_410.35],
        [null, 'Mise&unforseen', null, null, null, 589.65],
        [null, 'Total', null, null, null, 280_000],
      ]),
    ]);
    expect(read.items).toHaveLength(1);
    const e = applyImport(buildTemplate({ capacity: '1x20 MVA', voltage: '66 kV', stream: 'Greenfield' }), plan, 'replace');
    expect(sectionTotals(e).total.civil).toBe(280_000);
  });

  it('a catalog rate applied by hand replaces the file amount for that rate only', () => {
    const line: EstimateLine = {
      id: 'x', section: 'electrical', code: '1', description: 'CT', unit: 'No', qty: 3, supplyRate: 12_000, erectionRate: 5_723, testingRate: 0,
      fileAmounts: { erection: { qty: 3, rate: 5_723, amount: 2_712.702 } },
    };
    const s = { supplyRate: 11_000, erectionRate: 0, testingRate: 0, notApplied: [], item: { code: '9.1', sheet: 'By code' } } as unknown as RateSuggestion;
    const out = applySuggestion(line, s).line;
    expect(out.supplyRate).toBe(11_000);
    expect(lineAmounts(out)).toEqual({ supply: 33_000, erection: 2_712.702, testing: 0 });
  });

  it('puts a line estimate\'s civil sheet and abstract in line works when the workbook also holds a terminal bay', () => {
    const LINE = 'Estimate for Conversion of 66kv S/C tapped line into LILO by stringing 2nd circuit for 6.634 kms';
    const BAY = 'Providing one number of 66kV line Terminal bay at 66/11kV Jangamakote Sub-station';
    const abs = (title: string, civil: number, statutory: number, land: number) =>
      grid(title === LINE ? 'ABSTRACT' : 'TB abs', [
        [title], ['ABSTRACT'], ['Sl. No.', 'Particulars', 'Amount in Rs. (Lakhs)'],
        [1, 'Material cost', 1], [2, 'Labour/Erection charges', 0], [3, 'Cost of Civil Engineering Works', civil], [4, 'Basic Rate', 1 + civil],
        [5, 'Area Specific Loading', 0], [6, 'Applicable GST', 0], [8, 'Statutory Charges', statutory], [9, 'Forest Clearance', 0],
        [10, 'Land/Corridor Compensation', land], [11, 'Total Cost of Estimate', 1 + civil + statutory + land],
      ]);
    const supply = (name: string, title: string) =>
      grid(name, [[title], ['Sl No', 'Description', 'Unit', 'Qty', 'Supply rate', 'Supply amount'], [1, 'ACSR Coyote conductor', 'km', 1, 100_000, 100_000]]);
    const civil = (name: string, title: string, amount: number) =>
      grid(name, [[title], ['Sl No', 'Description', 'Unit', 'Qty', 'Rate', 'Amount'], [1, 'Earth work excavation', 'Cum', 1, amount, amount]]);
    const read = parseBoq(
      [supply('Jangamakote Supply&Erection', LINE), civil('J.Kote Civil', LINE, 200_000), abs(LINE, 2, 5, 255.84), supply('tb material', BAY), civil('TB CIVIL', BAY, 100_000), abs(BAY, 1, 2, 0)],
      'jkote.xlsx',
      'electrical',
    );
    expect(read.sheets.find((s) => s.name === 'Jangamakote Supply&Erection')!.section).toBe('line');
    expect(read.sheets.find((s) => s.name === 'J.Kote Civil')!.section).toBe('lineCivil');
    expect(read.sheets.find((s) => s.name === 'TB CIVIL')!.section).toBe('civil');
    expect(read.abstracts!.map((a) => [a.sheet, a.part])).toEqual([['ABSTRACT', 'line'], ['TB abs', 'I']]);
  });
});
