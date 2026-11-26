import { parseBoq } from '@/features/boq-import/parse';
import type { SheetGrid } from '@/features/boq-import/types';
import { classifySheets, placeEstimateSheets, SLOTS, SKIP } from './workbookSheets';

const LH = 'KARNATAKA POWER TRANSMISSION CORPORATION LIMITED';
const JOB = 'Conversion of existing Coyote conductor of 66kV Dabaspete-Nelamangala DC line by HTLS conductor';
const sheet = (name: string, title: string, rows: (string | number | null)[][] = [['Sl No', 'Description', 'Unit', 'Qty', 'Rate', 'Amount']]): SheetGrid => ({ name, rows: [[LH], [JOB], [title], ...rows] });
const slotName = (places: ReturnType<typeof classifySheets>, name: string) => {
  const p = places.find((x) => x.name === name)!;
  return p.slot === SKIP ? 'skip' : SLOTS[p.slot];
};

describe('estimate sheets in the final DPR', () => {
  const grids: SheetGrid[] = [
    sheet('GABS', 'GENERAL ABSTRACT'),
    sheet('Line Abstract', 'ABSTRACT-I'),
    sheet('Line material', 'Supply of materials'),
    sheet('Line civil', 'PART-B: LINE CIVIL'),
    sheet('DAB', 'ABSTRACT-II'),
    sheet('Dis Labour', 'DECOMMISSIONING PART'),
    sheet('land compensation', 'LAND COMPENSATION FOR TOWER FOOT AREA'),
    sheet('Abstract UG Cable', 'ABSTRACT - UG CABLE'),
    sheet('Supply Cable', 'PART - A - POWER CABLE SUPPLY'),
    sheet('Erection', 'PART - B - ERECTION CHARGES'),
    sheet('Cable Civil', 'PART - C : CIVIL'),
    sheet('PERT', 'PROVISIONAL PERT CHART'),
    sheet('Report', 'REPORT'),
  ];

  it('sorts sheets by their own names and titles, nothing job-specific', () => {
    const places = classifySheets(grids, 'estimate.xlsx');
    expect(slotName(places, 'GABS')).toBe('General Abstract');
    expect(slotName(places, 'Line Abstract')).toBe('Line Abstract');
    expect(slotName(places, 'Line material')).toBe('Line labour and material');
    expect(slotName(places, 'Abstract UG Cable')).toBe('UG Abstract');
    expect(slotName(places, 'Supply Cable')).toBe('UG Material');
    expect(slotName(places, 'Erection')).toBe('UG Labour');
    expect(slotName(places, 'Cable Civil')).toBe('UG Civil');
    expect(slotName(places, 'DAB')).toBe('Dismantling Abstract');
    expect(slotName(places, 'Dis Labour')).toBe('Dismantling labour');
    expect(slotName(places, 'land compensation')).toBe('Other sheets');
    expect(slotName(places, 'Report')).toBe('Other sheets');
    expect(slotName(places, 'PERT')).toBe('skip');
  });

  it('prints every workbook sheet in the set order when the estimate prints none of them', () => {
    const read = parseBoq(grids, 'estimate.xlsx', 'electrical');
    const placed = placeEstimateSheets([], [{ fileName: 'estimate.xlsx', grids, read: { ...read, items: [], abstracts: [] } }]);
    expect(placed.map((p) => p.name)).toEqual(['GABS', 'Line Abstract', 'Line material', 'Line civil', 'Abstract UG Cable', 'Supply Cable', 'Erection', 'Cable Civil', 'DAB', 'Dis Labour', 'land compensation', 'Report']);
  });

  it('a terminal-bay workbook puts the estimate station sheets in the TB places and keeps the general abstract first', () => {
    const job = 'Providing one number 66 kV line Terminal Bay at existing 66/11 kV Sadali sub-station for the 2nd circuit';
    const tb: SheetGrid[] = [
      { name: 'Civil ', rows: [[LH], [job], ['CIVIL PORTION'], ['Sl No', 'Specifications', 'Unit', 'Qty']] },
      { name: 'Electrical Estimate', rows: [[LH], [job], ['Supply of materials'], ['Sl No', 'Description', 'Unit', 'Qty']] },
      { name: '7th Schedule ', rows: [[LH], [job], ['CREDIT Estimate'], ['Sl No', 'Particulars', 'Unit', 'Qty']] },
    ];
    const read = parseBoq(tb, 'Sadali_Terminal_Bay.xlsx', 'electrical');
    const app = ['Abstract-I', 'Part A Electrical', 'General Abstract'].map((key) => ({ key, title: key, notes: [], columns: [], rows: [] }));
    const placed = placeEstimateSheets(app, [{ fileName: 'Sadali_Terminal_Bay.xlsx', grids: tb, read: { ...read, items: [] } }]);
    expect(placed.map((p) => `${SLOTS[p.slot]}: ${p.name}`)).toEqual([
      'General Abstract: General Abstract',
      'TB Abstract: Abstract-I',
      'TB Material and Labour: Part A Electrical',
      'TB Material and Labour: Electrical Estimate',
      'TB Civil: Civil',
      'Other sheets: 7th Schedule',
    ]);
  });
});

describe('parts with nothing in them', () => {
  it('leave an empty station part out of a line-work PDF', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const { sheetsFromWorkbook } = await import('./sheets');
    const wb = new ExcelJS.Workbook();
    const head = ['Sl No.', 'Name of the Equipment/Materials', 'Unit', 'Qty', 'Rate', 'Amount'];
    const empty = wb.addWorksheet('Part A Electrical');
    empty.addRows([['Supply of station materials'], head, ['', 'Sub Total'], ['', 'Miscellaneous'], ['', 'Grand Total']]);
    const line = wb.addWorksheet('Line Supply');
    line.addRows([['Line works'], head, ['A1', 'ACSR Drake conductor', 'km', 3, 100, 300], ['', 'Grand Total', '', '', '', 300]]);
    expect(sheetsFromWorkbook(wb).map((s) => s.key)).toEqual(['Line Supply']);
  });
});
