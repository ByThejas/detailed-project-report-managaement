import type * as Docx from 'docx';
import type { DprRow } from '@/features/reports/types';
import type { DprDocuments } from '@/features/documents/types';
import { filesOf } from '@/features/documents/state';
import { SECTION_KEYS, abstractOf, generalAbstract, hasLineWorks, lineAmounts, sectionTotals, type AbstractRow } from '@/features/preparation/calc';
import { DEFAULT_FINANCIALS, summariseFinancials } from '@/features/preparation/finance';
import type { Estimate, EstimateSection } from '@/features/preparation/types';
import { DETAIL_FIELDS, SECTIONS, type DprContent } from './content';

export interface DprDocInput {
  dpr: DprRow;
  estimate: Estimate;
  documents: DprDocuments;
  content: DprContent;
  /** Anything still missing. When not empty, the cover is marked DRAFT and lists it. */
  gaps: string[];
  now?: Date;
}

const inr = (n: number, digits = 2) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
const qty = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(n);

/** Annexures as in the sample DPR, and the document each one comes from. */
export const ANNEXURES = [
  { letter: 'A', title: 'Estimates and abstract', doc: null },
  { letter: 'B', title: 'PERT chart', doc: null },
  { letter: 'C', title: 'Grid map', doc: 'grid-map' },
  { letter: 'D', title: 'Financial BCR', doc: null },
  { letter: 'E', title: 'Extract of TCCM proceedings', doc: 'tccm-proceedings' },
  { letter: 'F', title: 'Earth mat suitability report', doc: 'earth-mat-design' },
  { letter: 'G', title: 'Layout diagram', doc: 'layout-drawing' },
  { letter: 'H', title: 'Single line diagram (SLD)', doc: 'single-line-diagram-sld' },
] as const;

/** Builds the Word document. The docx module is passed in so the browser can load it only when needed. */
export function createDprDocument(d: typeof Docx, input: DprDocInput): Docx.Document {
  const { dpr, estimate: e, documents, content, gaps } = input;
  const { AlignmentType, BorderStyle, Footer, Header, HeadingLevel, PageBreak, PageNumber, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } = d;
  const g = generalAbstract(e);
  const f = e.financials ?? DEFAULT_FINANCIALS;
  const fin = summariseFinancials(g.total, f);
  const brownfield = e.lines.some((l) => l.section === 'dismantling');
  const lineWorks = hasLineWorks(e);
  const bcr = fin.bcr === null ? 'Not calculated' : fin.bcr.toFixed(2);
  const irr = fin.irr === null ? 'Not calculated' : `${(fin.irr * 100).toFixed(1)}%`;
  const payback = fin.discountedPayback === null ? 'Not calculated' : `${fin.discountedPayback} years`;

  // ---- small builders ----
  const text = (t: string, o: { bold?: boolean; size?: number; italics?: boolean; color?: string } = {}) => new TextRun({ text: t, ...o });
  const para = (t: string, o: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number; italics?: boolean; color?: string } = {}) =>
    new Paragraph({ alignment: o.align, spacing: { after: o.after ?? 120, before: o.before ?? 0 }, children: [text(t, o)] });
  const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
  const heading = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, children: [text(t.toUpperCase(), { bold: true, size: 24 })] });
  const subheading = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 }, children: [text(t, { bold: true, size: 22 })] });
  const paragraphs = (body: string) =>
    body
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => new Paragraph({ spacing: { after: 120 }, alignment: AlignmentType.JUSTIFIED, children: block.split('\n').flatMap((line, i) => (i ? [new TextRun({ text: line, break: 1 })] : [new TextRun(line)])) }));

  const border = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (t: string, o: { bold?: boolean; right?: boolean; shade?: boolean; span?: number; width?: number } = {}) =>
    new TableCell({
      borders,
      columnSpan: o.span,
      width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
      shading: o.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EDEDED' } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [new Paragraph({ alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [text(t, { bold: o.bold, size: 19 })] })],
    });
  const table = (head: string[], rows: string[][], o: { numeric?: number[]; widths?: number[]; boldRows?: number[] } = {}) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, { bold: true, shade: true, width: o.widths?.[i], right: o.numeric?.includes(i) })) }),
        ...rows.map((r, ri) => new TableRow({ children: r.map((c, i) => cell(c, { right: o.numeric?.includes(i), bold: o.boldRows?.includes(ri), width: o.widths?.[i] })) })),
      ],
    });
  const keyValue = (rows: [string, string][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map(([k, v]) => new TableRow({ children: [cell(k, { bold: true, shade: true, width: 35 }), cell(v || '—', { width: 65 })] })),
    });
  const abstractTable = (rows: AbstractRow[]) =>
    table(
      ['Sl. No.', 'Particulars', 'Amount in lakhs'],
      rows.map((r, i) => [String(i + 1), r.label, inr(r.lakhs)]),
      { numeric: [2], widths: [10, 70, 20], boldRows: rows.flatMap((r, i) => (r.emphasis ? [i] : [])) },
    );
  const singleRateTable = (section: EstimateSection, miscLabel: string) => {
    const { subTotal, total } = sectionTotals(e);
    const key = SECTION_KEYS[section].supply;
    const lines = e.lines.filter((l) => l.section === section);
    return table(
      ['Sl. No.', 'Particulars', 'Unit', 'Qty', 'Rate (Rs)', 'Amount (Rs)'],
      [
        ...lines.map((l) => [l.code, l.description, l.unit, qty(l.qty), inr(l.supplyRate), inr(lineAmounts(l).supply)]),
        ['', 'Sub total', '', '', '', inr(subTotal[key])],
        ['', miscLabel, '', '', '', inr(e.misc[key] ?? 0)],
        ['', 'Total amount', '', '', '', inr(total[key])],
      ],
      { numeric: [3, 4, 5], widths: [8, 50, 8, 9, 12, 13], boldRows: [lines.length + 2] },
    );
  };
  const lineSupplyTable = () => {
    const { subTotal, total } = sectionTotals(e);
    const lines = e.lines.filter((l) => l.section === 'line');
    const labour = (l: (typeof lines)[number]) => lineAmounts(l).erection + lineAmounts(l).testing;
    return table(
      ['Sl. No.', 'Description', 'Unit', 'Qty', 'Material rate', 'Material amount', 'Labour rate', 'Labour amount'],
      [
        ...lines.map((l) => [l.code, l.description, l.unit, qty(l.qty), inr(l.supplyRate), inr(lineAmounts(l).supply), inr(l.erectionRate + l.testingRate), inr(labour(l))]),
        ['', 'Sub total', '', '', '', inr(subTotal.lineSupply), '', inr(subTotal.lineErection + subTotal.lineTesting)],
        ['', 'Miscellaneous', '', '', '', inr(e.misc.lineSupply ?? 0), '', inr((e.misc.lineErection ?? 0) + (e.misc.lineTesting ?? 0))],
        ['', 'Total', '', '', '', inr(total.lineSupply), '', inr(total.lineErection + total.lineTesting)],
      ],
      { numeric: [3, 4, 5, 6, 7], widths: [7, 37, 8, 7, 10, 12, 9, 10], boldRows: [lines.length + 2] },
    );
  };
  const filesFor = (key: string | null) => (key ? filesOf(documents, key).map((x) => x.name) : []);

  const header = new Header({
    children: [
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'A0A0A0', space: 2 } },
        children: [text('KARNATAKA POWER TRANSMISSION CORPORATION LTD', { size: 16, color: '606060' }), text('\tDETAILED PROJECT REPORT', { size: 16, color: '606060' })],
        tabStops: [{ type: d.TabStopType.RIGHT, position: d.TabStopPosition.MAX }],
      }),
    ],
  });
  const footer = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: d.TabStopType.RIGHT, position: d.TabStopPosition.MAX }],
        children: [text(`${dpr.id} · ${dpr.project}`, { size: 16, color: '606060' }), new TextRun({ children: ['\tPage ', PageNumber.CURRENT], size: 16, color: '606060' })],
      }),
    ],
  });

  // ---- cover ----
  const cover = [
    para('KARNATAKA POWER TRANSMISSION CORPORATION LIMITED', { bold: true, size: 28, align: AlignmentType.CENTER, before: 600 }),
    para('A Government of Karnataka Undertaking', { size: 18, align: AlignmentType.CENTER, after: 600, italics: true }),
    ...(gaps.length
      ? [
          para('DRAFT: NOT READY FOR SUBMISSION', { bold: true, size: 24, align: AlignmentType.CENTER, color: 'B00020' }),
          para(`Still missing: ${gaps.slice(0, 12).join('; ')}${gaps.length > 12 ? `; and ${gaps.length - 12} more` : ''}.`, { size: 18, align: AlignmentType.CENTER, color: 'B00020', after: 400 }),
        ]
      : []),
    para('DETAILED PROJECT REPORT', { bold: true, size: 32, align: AlignmentType.CENTER, after: 300 }),
    para(dpr.project.toUpperCase(), { bold: true, size: 30, align: AlignmentType.CENTER, after: 200 }),
    para(content.details.location, { size: 20, align: AlignmentType.CENTER, after: 600 }),
    keyValue([
      ['Project code', dpr.id],
      ['Jurisdiction', content.details.jurisdiction],
      ['Project nature', dpr.stream === 'Brownfield' ? 'Brown field' : 'Green field'],
      ['Estimated cost', `Rs ${inr(g.total)} lakh`],
      ['B/C ratio', bcr],
      ['IRR', irr],
      ['Payback', payback],
    ]),
    para(content.details.preparedBy ? `Prepared by: ${content.details.preparedBy}` : '', { size: 18, before: 400 }),
    para(`Generated on ${(input.now ?? new Date()).toLocaleDateString('en-IN', { dateStyle: 'long' })}`, { size: 16, color: '808080' }),
  ];

  const contents = [
    pageBreak(),
    para('CONTENTS', { bold: true, size: 26, after: 200 }),
    table(
      ['No.', 'Section'],
      [['01', 'Project at a glance'], ...SECTIONS.map((s) => [s.no, s.title]), ['14', 'Salient features'], ['', 'Annexures A to H']],
      { widths: [12, 88] },
    ),
  ];

  const glance = [
    pageBreak(),
    heading('01 Project at a glance'),
    keyValue([
      ...DETAIL_FIELDS.filter((x) => !['jurisdiction', 'preparedBy'].includes(x.key)).map((x) => [x.label, content.details[x.key]] as [string, string]),
      ['Cost of DPR', `Rs ${inr(g.total)} lakh`],
      ['Benefit-cost ratio', bcr],
      ['Internal rate of return', irr],
      ['Payback period', payback],
    ]),
  ];

  const body = SECTIONS.flatMap((s) => [
    heading(`${s.no} ${s.title}`),
    ...paragraphs(content.sections[s.key]),
    ...(s.key === 'costBenefit'
      ? [
          keyValue([
            ['Benefit-cost ratio (BCR)', bcr],
            ['Internal rate of return (IRR)', irr],
            ['Payback period', fin.payback === null ? 'Not calculated' : `${fin.payback} years (simple), ${payback} discounted at ${f.discountRatePct}%`],
            ['Cost of DPR', `Rs ${inr(g.total)} lakh`],
          ]),
        ]
      : []),
  ]);

  const { total } = sectionTotals(e);
  const salient = [
    heading('14 Salient features'),
    keyValue([
      ['Scope of the work', content.details.nameOfWork],
      ['Proposed capacity', content.details.proposedCapacity],
      ['Existing capacity', content.details.existingCapacity],
      ['Electrical works (Part A)', `Rs ${inr((total.supply + total.erection + total.testing) / 100_000)} lakh before loading and GST`],
      ['Civil works (Part B)', `Rs ${inr(total.civil / 100_000)} lakh before loading and GST`],
      ...(lineWorks ? ([['Line works', `Rs ${inr(g.line)} lakh including loading, GST and charges`]] as [string, string][]) : []),
      ...(brownfield ? ([['Dismantling (Abstract-II)', `Rs ${inr(g.dismantling)} lakh`]] as [string, string][]) : []),
      ['Earthing', filesFor('earth-mat-design').length ? 'Earth mat design report attached (Annexure F)' : 'Earth mat design report not yet attached'],
      ['Rates', content.details.priceBasis],
    ]),
  ];

  const annexureList = [
    pageBreak(),
    para('ANNEXURES', { bold: true, size: 26, after: 200 }),
    table(
      ['Annexure', 'Title', 'Source'],
      ANNEXURES.map((a) => {
        const files = filesFor(a.doc);
        const source = a.letter === 'A' || a.letter === 'D' ? 'Included in this report' : files.length ? `Attached separately: ${files.join(', ')}` : a.doc ? 'Not yet attached' : 'To be attached';
        return [a.letter, a.title, source];
      }),
      { widths: [14, 40, 46] },
    ),
  ];

  const annexA = [
    pageBreak(),
    heading('Annexure A: Estimates and abstract'),
    subheading('General abstract'),
    table(
      ['Sl. No.', 'Particulars', 'Amount in lakhs'],
      [
        ['1', `Substation capital works: ${dpr.project}`, inr(g.capital)],
        ...(lineWorks ? [['2', 'Line works', inr(g.line)]] : []),
        ...(brownfield ? [[String(lineWorks ? 3 : 2), 'Dismantling of the existing equipment', inr(g.dismantling)]] : []),
        ['', 'Total project cost', inr(g.total)],
      ],
      { numeric: [2], widths: [10, 70, 20], boldRows: [1 + Number(lineWorks) + Number(brownfield)] },
    ),
    subheading('Abstract-I: capital works'),
    abstractTable(abstractOf(e, 'I')),
    subheading('Part B: civil works'),
    singleRateTable('civil', 'Rounding off'),
    ...(lineWorks ? [subheading('Abstract: line works'), abstractTable(abstractOf(e, 'line')), subheading('Line works: supply and erection'), lineSupplyTable(), subheading('Line works: civil portion'), singleRateTable('lineCivil', 'Miscellaneous and unforeseen')] : []),
    ...(brownfield ? [subheading('Abstract-II: dismantling'), abstractTable(abstractOf(e, 'II')), subheading('Dismantling: decommissioning part'), singleRateTable('dismantling', 'Miscellaneous')] : []),
  ];

  const { subTotal } = sectionTotals(e);
  const electrical = e.lines.filter((l) => l.section === 'electrical');
  const partA = [
    heading('Annexure A (contd.): Part A, supply, erection, testing and commissioning'),
    table(
      ['Sl. No.', 'Name of the equipment / materials', 'Unit', 'Qty', 'Supply rate', 'Supply amount', 'Erection rate', 'Erection amount', 'T&C rate', 'T&C amount'],
      [
        ...electrical.map((l) => {
          const a = lineAmounts(l);
          return [l.code, l.description, l.unit, qty(l.qty), inr(l.supplyRate), inr(a.supply), inr(l.erectionRate), inr(a.erection), inr(l.testingRate), inr(a.testing)];
        }),
        ['', 'Sub total', '', '', '', inr(subTotal.supply), '', inr(subTotal.erection), '', inr(subTotal.testing)],
        ['', 'Miscellaneous and unforeseen', '', '', '', inr(e.misc.supply), '', inr(e.misc.erection), '', inr(e.misc.testing)],
        ['', 'Total', '', '', '', inr(total.supply), '', inr(total.erection), '', inr(total.testing)],
      ],
      { numeric: [3, 4, 5, 6, 7, 8, 9], widths: [6, 30, 5, 5, 9, 11, 8, 10, 7, 9], boldRows: [electrical.length + 2] },
    ),
  ];

  const rate = f.discountRatePct / 100;
  let cumulative = 0;
  const bcrRows = f.benefits.map((b, i) => {
    const factor = 1 / (1 + rate) ** (i + 1);
    cumulative += b * factor;
    return [String(i + 1), inr(b), factor.toFixed(4), inr(b * factor), inr(cumulative)];
  });
  const annexD = [
    heading('Annexure D: Financial BCR'),
    keyValue([
      ['Project cost', `Rs ${inr(g.total)} lakh`],
      ['Discount rate', `${f.discountRatePct}%`],
      ['Benefit-cost ratio', bcr],
      ['Internal rate of return', irr],
      ['Payback (discounted)', payback],
    ]),
    para('', { after: 120 }),
    f.benefits.length
      ? table(['Year', 'Benefit (Rs lakh)', 'Discount factor', 'Present value', 'Cumulative present value'], bcrRows, { numeric: [1, 2, 3, 4] })
      : para('[Yearly benefits not entered yet.]', { italics: true }),
    ...ANNEXURES.filter((a) => a.doc || a.letter === 'B').flatMap((a) => {
      const files = filesFor(a.doc);
      return [heading(`Annexure ${a.letter}: ${a.title}`), para(files.length ? `Attached separately: ${files.join(', ')}.` : '[To be attached.]', { italics: !files.length })];
    }),
  ];

  const portrait = { margin: { top: 1200, bottom: 1100, left: 1200, right: 1100 } };
  return new d.Document({
    creator: 'DPR Manager',
    title: `DPR ${dpr.id}: ${dpr.project}`,
    styles: { default: { document: { run: { font: 'Arial', size: 21 } } } },
    sections: [
      { properties: { titlePage: true, page: portrait }, headers: { default: header, first: new Header({ children: [] }) }, footers: { default: footer, first: new Footer({ children: [] }) }, children: [...cover, ...contents, ...glance, ...body, ...salient, ...annexureList, ...annexA] },
      { properties: { page: { ...portrait, size: { orientation: PageOrientation.LANDSCAPE } } }, headers: { default: header }, footers: { default: footer }, children: partA },
      { properties: { page: portrait }, headers: { default: header }, footers: { default: footer }, children: annexD },
    ],
  });
}

/** Builds the .docx in the browser and starts the download. */
export async function downloadDprDocx(input: DprDocInput) {
  const d = await import('docx');
  const blob = await d.Packer.toBlob(createDprDocument(d, input));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DPR_${input.dpr.id.replace(/\W+/g, '-')}${input.gaps.length ? '_DRAFT' : ''}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
