import JSZip from 'jszip';
import { extractFacts, readFileText } from './extract';

const tccm = `PROCEEDINGS OF THE 6th TCCM of BESCOM (Brown Field) held on 24.09.2026 at Corporate Office.
Subject No. 63: Providing additional 1x20 MVA transformer at 66/11 kV Thyavanige S/S.
The present recorded peak load is 10.6 MW on the existing 1x12.5 MVA transformer.
The work is included in List - III of FY 2026-27, APW Code: BB1189.`;

describe('facts from attached files', () => {
  it('finds the approval, APW code, budget line and load in TCCM proceedings, with where it was found', () => {
    const s = extractFacts([{ file: 'tccm.pdf', docKey: 'tccm-proceedings', pages: ['cover page', tccm] }]);
    const by = Object.fromEntries(s.map((x) => [x.label, x]));
    expect(by['Approval']!.value).toBe('6th TCCM of BESCOM (Brown Field) held on 24.09.2026, Subject-63.');
    expect(by['Approval']!.page).toBe(2);
    expect(by['Approval']!.snippet).toContain('6th TCCM of BESCOM');
    expect(by['APW code']!.value).toBe('BB1189');
    expect(by['Financial year']!.value).toBe('FY 2026-27');
    expect(by['Budget provision']!.value).toBe('Included in List – III, FY 2026-27 APW Code: BB1189.');
    expect(by['Recorded peak load (MW)']!.value).toBe('10.6');
    // Existing transformers are read only from the load details, not from the TCCM text.
    expect(by['Existing transformers']).toBeUndefined();
  });

  it('finds the BOM letter and earthmat drawing only in their own documents', () => {
    const bom = 'Bill of material approved vide letter No. CEE(P&C)/SEE(P)/EE(SS)/BC-26/2026-27/1123, dated 12.08.2026.';
    const earth = 'Earthmat design: Drg. No. R&D/EM/66/2026/42 dated 03.07.2026';
    expect(extractFacts([{ file: 'tccm.pdf', docKey: 'tccm-proceedings', pages: [bom] }]).some((x) => x.label === 'Layout/BOM letter')).toBe(false);
    const s = extractFacts([
      { file: 'layout.pdf', docKey: 'layout-drawing', pages: [bom] },
      { file: 'earthmat.pdf', docKey: 'earth-mat-design', pages: [earth.replace('R&D/', 'RD/')] },
    ]);
    expect(s.find((x) => x.label === 'Layout/BOM letter')!.value).toContain('letter No. CEE(P&C)/SEE(P)/EE(SS)/BC-26/2026-27/1123, dated 12.08.2026');
    expect(s.find((x) => x.label === 'Earthmat drawing')!.value).toBe('Earthmat is provided as per the SEE (R&D) design, Drg. No. RD/EM/66/2026/42, dated 03.07.2026.');
  });

  it('reads the text of a Word file and says when a file has no text', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Peak load 5.8 MW &amp; 2x8 MVA</w:t></w:r></w:p></w:body></w:document>');
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    const t = await readFileText({ name: 'load.docx', type: '', bytes }, 'transformer-feeder-load-details');
    expect(t.pages[0]).toContain('Peak load 5.8 MW & 2x8 MVA');
    expect(extractFacts([t]).map((x) => x.value)).toEqual(['5.8', '2x8 MVA']);
    expect((await readFileText({ name: 'boq.xlsx', type: '', bytes: new ArrayBuffer(1) }, 'x')).note).toBe('not a PDF, Word or text file');
  });
});
