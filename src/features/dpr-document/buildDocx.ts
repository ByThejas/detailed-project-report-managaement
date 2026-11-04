import type * as Docx from 'docx';
import type { DprRow } from '@/features/reports/types';
import type { DprDocuments } from '@/features/documents/types';
import { filesOf } from '@/features/documents/state';
import { SECTION_KEYS, abstractOf, generalAbstract, hasLineWorks, lineAmounts, sectionTotals, type AbstractRow } from '@/features/preparation/calc';
import { DEFAULT_BCR_INPUTS, DEFAULT_FINANCIALS, isBcrExempt, kptclAppraisal, summariseFinancials } from '@/features/preparation/finance';
import type { Estimate, EstimateSection } from '@/features/preparation/types';
import { DETAIL_FIELDS, applies, letteredSections, lineScale, type DprContent, type SimpleTable } from './content';
import { criticalPath, pertMilestones, pertMonths } from './pert';

export interface DprDocInput {
  dpr: DprRow;
  estimate: Estimate;
  documents: DprDocuments;
  content: DprContent;
  /** Anything still missing. When not empty, the cover is marked DRAFT and lists it. */
  gaps: string[];
  now?: Date;
  /** Version number, added to the file name. */
  version?: number;
}

const inr = (n: number, digits = 2) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
const qty = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(n);

/**
 * Annexures 3 to 9, numbered as in the Thyavanige DPR's contents. Generated ones are built here; the others
 * come from files attached in Documents and are merged in after printing.
 */
export const ANNEXURES = [
  { no: '3', title: 'Estimates & abstract', docs: [], generated: true },
  { no: '4', title: 'PERT chart', docs: [], generated: true },
  { no: '5', title: 'Grid map copy', docs: ['grid-map'], generated: false },
  { no: '6', title: 'Financial BCR', docs: [], generated: true },
  { no: '7', title: 'Extract of TCCM proceedings', docs: ['tccm-proceedings'], generated: false },
  { no: '8', title: 'Layout diagram and BOM', docs: ['layout-drawing', 'single-line-diagram-sld', 'bill-of-quantity-electrical'], generated: false },
  { no: '9', title: 'R&D earthmat design report', docs: ['earth-mat-design'], generated: false },
] as const;

/** Builds the Word document. The docx module is passed in so the browser can load it only when needed. */
export function createDprDocument(d: typeof Docx, input: DprDocInput): Docx.Document {
  const { dpr, estimate: e, documents, content, gaps } = input;
  const { AlignmentType, BorderStyle, Footer, Header, PageBreak, PageNumber, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } = d;
  const D = content.details;
  const g = generalAbstract(e);
  const f = e.financials ?? DEFAULT_FINANCIALS;
  const fin = summariseFinancials(g.total, f);
  const brownfield = e.lines.some((l) => l.section === 'dismantling');
  const lineWorks = hasLineWorks(e);
  // Pure line works carry no BCR anywhere: no cover figures, no section, no annexure 6 (ADR-0007).
  const noBcr = isBcrExempt(e);
  const notYet = 'Not calculated';
  const bcr = fin.bcr === null ? notYet : fin.bcr.toFixed(2);
  const irr = fin.irr === null ? notYet : f.method === 'kptcl' ? `${Math.round(fin.irr * 100)}%` : `${(fin.irr * 100).toFixed(1)}%`;
  const payback = fin.discountedPayback === null ? notYet : `${fin.discountedPayback} Years`;
  const running = (D.runningTitle || dpr.project).toUpperCase();

  // ---- small builders ----
  type Align = (typeof AlignmentType)[keyof typeof AlignmentType];
  type ParaOpts = { bold?: boolean; size?: number; align?: Align; after?: number; before?: number; italics?: boolean; color?: string; caps?: boolean };
  const text = (t: string, o: { bold?: boolean; size?: number; italics?: boolean; color?: string; allCaps?: boolean } = {}) => new TextRun({ text: t, ...o });
  const para = (t: string, o: ParaOpts = {}) =>
    new Paragraph({ alignment: o.align, spacing: { after: o.after ?? 120, before: o.before ?? 0 }, children: [text(t, { bold: o.bold, size: o.size, italics: o.italics, color: o.color, allCaps: o.caps })] });
  const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
  const chapter = (no: string, t: string) => new Paragraph({ heading: d.HeadingLevel.HEADING_1, spacing: { before: 120, after: 200 }, children: [text(`${no} `, { bold: true, size: 30, color: '1F3864' }), text(t.toUpperCase(), { bold: true, size: 26 })] });
  const lettered = (letter: string, t: string) => new Paragraph({ heading: d.HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [text(`${letter}. ${t.toUpperCase()}`, { bold: true, size: 22 })] });
  const minor = (t: string, keepCase = false) => new Paragraph({ heading: d.HeadingLevel.HEADING_3, spacing: { before: 160, after: 100 }, children: [text(keepCase ? t : t.toUpperCase(), { bold: true, size: 20 })] });
  /** Blank lines start a paragraph; "1. …" paragraphs get a hanging indent, as in the KPTCL house style. */
  const paragraphs = (body: string) =>
    body
      .split(/\n\s*\n|\n(?=\s*\d+\.\s)/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        const numbered = /^(\d+\.)\s+([\s\S]*)$/.exec(block);
        const lines = (numbered ? numbered[2]! : block).split('\n');
        const runs = lines.flatMap((line, i) => (i ? [new TextRun({ text: line.trim(), break: 1 })] : [new TextRun(line.trim())]));
        return new Paragraph({
          spacing: { after: 140, line: 300 },
          alignment: AlignmentType.JUSTIFIED,
          indent: numbered ? { left: 567, hanging: 567 } : undefined,
          children: numbered ? [new TextRun(`${numbered[1]}\t`), ...runs] : runs,
          tabStops: numbered ? [{ type: d.TabStopType.LEFT, position: 567 }] : undefined,
        });
      });

  const border = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const cell = (t: string, o: { bold?: boolean; right?: boolean; center?: boolean; shade?: string; span?: number; width?: number; size?: number; noBorder?: boolean; color?: string } = {}) =>
    new TableCell({
      borders: o.noBorder ? { top: none, bottom: none, left: none, right: none } : borders,
      columnSpan: o.span,
      width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
      shading: o.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: o.shade } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: t.split('\n').map((line) => new Paragraph({ alignment: o.right ? AlignmentType.RIGHT : o.center ? AlignmentType.CENTER : AlignmentType.LEFT, children: [text(line, { bold: o.bold, size: o.size ?? 19, color: o.color })] })),
    });
  const table = (head: string[], rows: string[][], o: { numeric?: number[]; widths?: number[]; boldRows?: number[]; size?: number } = {}) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, { bold: true, shade: 'E7ECF4', width: o.widths?.[i], right: o.numeric?.includes(i), size: o.size })) }),
        ...rows.map((r, ri) => new TableRow({ children: r.map((c, i) => cell(c, { right: o.numeric?.includes(i), bold: o.boldRows?.includes(ri), width: o.widths?.[i], size: o.size })) })),
      ],
    });
  const keyValue = (rows: [string, string][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map(([k, v]) => new TableRow({ children: [cell(k.toUpperCase(), { bold: true, shade: 'F2F2F2', width: 32, size: 18 }), cell(v || '—', { width: 68 })] })),
    });
  const scale = noBcr ? lineScale(content) : null;
  const kpiStrip = () => {
    const [heads, values] = scale
      ? [['Route length', 'Towers', 'Terminal bays'], [scale.route, scale.towers, scale.bays]]
      : [['Benefit–cost ratio', 'Internal rate of return', 'Payback period'], [bcr, irr, payback.toLowerCase()]];
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: heads.map((h) => cell(h, { shade: '1F3864', color: 'FFFFFF', bold: true, width: 33, size: 18 })) }),
        new TableRow({ children: values.map((v) => cell(v, { bold: true, size: 36, width: 33 })) }),
      ],
    });
  };
  const simpleTable = (t: SimpleTable) => {
    const rows = t.rows.filter((r) => r.slice(1).some((c) => c.trim()));
    if (!rows.length) return [];
    return [minor(t.title), table(t.columns, rows)];
  };
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
  const filesFor = (keys: readonly string[]) => keys.flatMap((k) => filesOf(documents, k).map((x) => x.name));

  const header = new Header({
    children: [
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'A0A0A0', space: 2 } },
        children: [text('KARNATAKA POWER TRANSMISSION CORPORATION LTD.', { size: 16, color: '606060', bold: true }), text('\tDETAILED PROJECT REPORT', { size: 16, color: '606060' })],
        tabStops: [{ type: d.TabStopType.RIGHT, position: d.TabStopPosition.MAX }],
      }),
    ],
  });
  const footer = new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'A0A0A0', space: 2 } },
        tabStops: [{ type: d.TabStopType.RIGHT, position: d.TabStopPosition.MAX }],
        children: [text(running, { size: 15, color: '606060' }), new TextRun({ children: ['\t', PageNumber.CURRENT], size: 16, color: '606060' })],
      }),
    ],
  });

  // ---- cover ----
  const coverFacts = (cells: [string, string][]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: cells.map(([k]) => cell(k, { bold: true, size: 16, color: '606060', noBorder: true, width: Math.floor(100 / cells.length) })) }),
        new TableRow({ children: cells.map(([, v]) => cell(v || '—', { bold: true, size: 22, noBorder: true, width: Math.floor(100 / cells.length) })) }),
      ],
    });
  const cover = [
    para('KARNATAKA POWER TRANSMISSION', { bold: true, size: 30, before: 200, after: 0, color: '1F3864' }),
    para('CORPORATION LIMITED', { bold: true, size: 30, after: 0, color: '1F3864' }),
    para('A GOVERNMENT OF KARNATAKA UNDERTAKING', { size: 16, after: 600, color: '606060' }),
    ...(gaps.length
      ? [
          para('DRAFT: NOT READY FOR SUBMISSION', { bold: true, size: 24, align: AlignmentType.CENTER, color: 'B00020' }),
          para(`Still missing: ${gaps.slice(0, 12).join('; ')}${gaps.length > 12 ? `; and ${gaps.length - 12} more` : ''}.`, { size: 16, align: AlignmentType.CENTER, color: 'B00020', after: 300 }),
        ]
      : []),
    para('D E T A I L E D   P R O J E C T   R E P O R T', { bold: true, size: 26, align: AlignmentType.CENTER, after: 300, color: '1F3864' }),
    para((D.nameOfWork || dpr.project).toUpperCase(), { bold: true, size: 28, align: AlignmentType.CENTER, after: 120 }),
    para((D.coverSubtitle || '').toUpperCase(), { size: 20, align: AlignmentType.CENTER, after: 600 }),
    coverFacts([
      ['APW CODE', [D.apwCode, D.financialYear].filter(Boolean).join(', ')],
      ['JURISDICTION', D.jurisdiction],
      ['PROJECT NATURE', D.projectNature],
    ]),
    para('', { after: 240 }),
    coverFacts([
      ['ESTIMATED COST (₹ LAKH)', `₹ ${inr(g.total)}`],
      ...(scale
        ? ([
            ['ROUTE LENGTH', scale.route],
            ['TOWERS', scale.towers],
            ['TERMINAL BAYS', scale.bays],
          ] as [string, string][])
        : ([
            ['B/C RATIO', bcr],
            ['IRR', irr],
            ['PAYBACK', payback],
          ] as [string, string][])),
    ]),
    para('PREPARED BY', { bold: true, size: 16, color: '606060', before: 900, after: 60 }),
    para(D.preparedBy || '—', { bold: true, size: 22, after: 0 }),
    para(D.preparedByRole, { size: 18, after: 200 }),
    para((D.reportMonth || (input.now ?? new Date()).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })).toUpperCase(), { bold: true, size: 18, align: AlignmentType.RIGHT }),
  ];

  // ---- contents ----
  // Annexure numbers stay as in the Thyavanige DPR (the PDF pack relies on them), so without a BCR 6 is skipped.
  const annexuresHere = ANNEXURES.filter((a) => !(noBcr && a.no === '6'));
  const sectionsHere = letteredSections(lineWorks, noBcr);
  const contentsRow = (no: string, t: string, indent = false) => new TableRow({ children: [cell(indent ? '' : no, { noBorder: true, width: 12 }), cell(indent ? `${no}    ${t}` : t, { noBorder: true, width: 88, bold: !indent })] });
  const contents = [
    pageBreak(),
    para('DETAILED PROJECT REPORT', { bold: true, size: 26, align: AlignmentType.CENTER, after: 200 }),
    para(D.nameOfWork || dpr.project, { size: 21, align: AlignmentType.CENTER, after: 120 }),
    para(D.location, { size: 18, align: AlignmentType.CENTER, after: 400, color: '606060' }),
    para('CONTENTS', { bold: true, size: 24, after: 200 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        contentsRow('1.', 'Project at a glance'),
        contentsRow('2.', 'Project report'),
        ...sectionsHere.flatMap((s) =>
          s.parts.length > 1
            ? [contentsRow(`${s.letter}.`, s.group, true), ...s.parts.map((p) => contentsRow('     ', 'sub' in p ? p.sub : p.title, true))]
            : [contentsRow(`${s.letter}.`, s.group, true)],
        ),
        contentsRow(`${String.fromCharCode(97 + sectionsHere.length)}.`, 'Salient features', true),
        ...annexuresHere.map((a) => contentsRow(`${a.no}.`, a.title)),
      ],
    }),
  ];

  // ---- 01 project at a glance ----
  const glanceRows: [string, string][] = DETAIL_FIELDS.filter((x) => x.group === 'glance' && applies(x, lineWorks)).map((x) => [x.label, D[x.key]]);
  glanceRows.splice(glanceRows.length - 1, 0, ['Cost of DPR', `${inr(g.total)} Lakh`]);
  const glance = [pageBreak(), chapter('01', 'Project at a glance'), keyValue(glanceRows), para('', { after: 240 }), kpiStrip()];

  // ---- 02 project report ----
  const report: (Docx.Paragraph | Docx.Table)[] = [pageBreak(), chapter('02', 'Project report')];
  for (const s of sectionsHere) {
    report.push(lettered(s.letter, s.group));
    s.parts.forEach((p) => {
      if ('sub' in p) report.push(minor(p.sub.replace(/\s(\S+)$/, (_, w: string) => ` ${w.toUpperCase()}`), true));
      report.push(...paragraphs(content.sections[p.key]));
      if (p.key === 'existing') report.push(...simpleTable(content.tables.existing));
      if (p.key === 'towers') report.push(...simpleTable(content.tables.towers));
      if (p.key === 'costBenefit')
        report.push(
          keyValue([
            ['Benefit–cost ratio (BCR)', bcr],
            ['Internal rate of return (IRR)', irr],
            ['Payback period', payback],
          ]),
        );
    });
  }
  report.push(lettered(String.fromCharCode(97 + sectionsHere.length), 'Salient features'), keyValue(content.salient.map((r) => [r.label, r.value])));

  // ---- 3. estimates & abstract ----
  const gaRow = (no: string, t: string, v: number) => [no, t, inr(v)];
  const generalAbstractRows: string[][] = [
    ['', 'PART-A: CAPITAL WORK', ''],
    gaRow('1', D.substationEstimateTitle || dpr.project, g.capital),
    ...(lineWorks ? [gaRow('2', D.lineEstimateTitle || 'Line works', g.line)] : []),
    ...(brownfield ? [['', 'PART-B: REVENUE WORKS', ''], gaRow('1', D.dismantlingTitle || 'Dismantling of existing assets', g.dismantling)] : []),
    ['', 'Total cost', inr(g.total)],
  ];
  const estimates = [
    pageBreak(),
    chapter('3.', 'Estimates & abstract'),
    para('KARNATAKA POWER TRANSMISSION CORPORATION LIMITED', { bold: true, align: AlignmentType.CENTER, after: 60 }),
    para(D.nameOfWork || dpr.project, { align: AlignmentType.CENTER, size: 19 }),
    para('GENERAL ABSTRACT', { bold: true, align: AlignmentType.CENTER, after: 120 }),
    table(['SL No', 'Particulars', 'Amount in Rs. (Lakhs)'], generalAbstractRows, {
      numeric: [2],
      widths: [10, 70, 20],
      boldRows: generalAbstractRows.flatMap((r, i) => (r[0] === '' ? [i] : [])),
    }),
    para(`Estimated Cost Rs ${inr(g.total)} Lakhs`, { bold: true, before: 200, after: 300 }),
    para('CERTIFICATE:', { bold: true, align: AlignmentType.CENTER, after: 80 }),
    ...paragraphs(D.certificate),
    ...D.signatory.split(/\n|,\s*(?=[A-Z])/).map((l, i) => para(l.trim(), { align: AlignmentType.RIGHT, bold: i === 0, after: 0, before: i === 0 ? 600 : 0 })),
    pageBreak(),
    minor('Abstract-I: substation capital works'),
    abstractTable(abstractOf(e, 'I')),
    minor('Part B: civil works'),
    singleRateTable('civil', 'Rounding off'),
    ...(lineWorks ? [minor('Abstract: line works'), abstractTable(abstractOf(e, 'line')), minor('Line works: civil portion'), singleRateTable('lineCivil', 'Miscellaneous and unforeseen')] : []),
    ...(brownfield ? [minor('Abstract-II: dismantling'), abstractTable(abstractOf(e, 'II')), minor('Dismantling estimate'), singleRateTable('dismantling', 'Miscellaneous and other unforeseen materials')] : []),
  ];

  const { subTotal, total } = sectionTotals(e);
  const electrical = e.lines.filter((l) => l.section === 'electrical');
  const lineLines = e.lines.filter((l) => l.section === 'line');
  const labour = (l: (typeof lineLines)[number]) => lineAmounts(l).erection + lineAmounts(l).testing;
  const landscapeEstimates = [
    minor('3. Estimates (contd.): Part A, supply, erection, testing and commissioning'),
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
      { numeric: [3, 4, 5, 6, 7, 8, 9], widths: [6, 30, 5, 5, 9, 11, 8, 10, 7, 9], boldRows: [electrical.length + 2], size: 17 },
    ),
    ...(lineWorks
      ? [
          minor('3. Estimates (contd.): line works, supply and erection'),
          table(
            ['Sl. No.', 'Description', 'Unit', 'Qty', 'Material rate', 'Material amount', 'Labour rate', 'Labour amount'],
            [
              ...lineLines.map((l) => [l.code, l.description, l.unit, qty(l.qty), inr(l.supplyRate), inr(lineAmounts(l).supply), inr(l.erectionRate + l.testingRate), inr(labour(l))]),
              ['', 'Sub total', '', '', '', inr(subTotal.lineSupply), '', inr(subTotal.lineErection + subTotal.lineTesting)],
              ['', 'Miscellaneous', '', '', '', inr(e.misc.lineSupply ?? 0), '', inr((e.misc.lineErection ?? 0) + (e.misc.lineTesting ?? 0))],
              ['', 'Total', '', '', '', inr(total.lineSupply), '', inr(total.lineErection + total.lineTesting)],
            ],
            { numeric: [3, 4, 5, 6, 7], widths: [7, 37, 8, 7, 10, 12, 9, 10], boldRows: [lineLines.length + 2], size: 17 },
          ),
        ]
      : []),
  ];

  // ---- 4. PERT chart ----
  const p = content.pert;
  const months = pertMonths(p);
  const monthLabel = (m: number) => `M${m}`;
  const pertWidth = Math.floor(70 / Math.max(1, months.length));
  const pert = [
    chapter('4.', 'PERT chart'),
    para(D.nameOfWork || dpr.project, { size: 19, after: 120 }),
    coverFacts([
      ['VOLTAGE CLASS', dpr.voltage],
      ['SCOPE', p.scope],
      ['TYPE OF WORK', p.kind ?? 'Sub-station work'],
      ['COMPLETION PERIOD', `${p.completionMonths} months${p.provisional ? ' (provisional schedule)' : ''}`],
      ['ZERO DATE', p.zeroDate],
    ]),
    ...(p.caseText ? [para(p.caseText, { size: 17, before: 80 })] : []),
    para('', { after: 160 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: [cell('Timeline', { bold: true, shade: 'E7ECF4', width: 30, size: 16 }), ...months.map((m) => cell(monthLabel(m), { bold: true, shade: 'E7ECF4', center: true, width: pertWidth, size: 14 }))] }),
        ...p.activities.map(
          (a) =>
            new TableRow({
              children: [
                cell(`${a.preAward ? 'Pre-award: ' : ''}${a.name}${a.preAward ? '' : ` · ${a.months} ${a.months === 1 ? 'month' : 'months'}`}${a.label ? `\n${a.label}` : ''}`, { bold: !a.preAward, width: 30, size: 16 }),
                ...months.map((m) => cell('', { width: pertWidth, shade: m >= a.start && m < a.start + a.months ? (a.preAward ? 'A6A6A6' : '2E75B6') : undefined })),
              ],
            }),
        ),
      ],
    }),
    para('', { after: 160 }),
    table(
      ['Stage', 'Months', 'From – to', 'Activities', 'Milestone'],
      p.activities.map((a) => [a.preAward ? `Pre-award: ${a.name}` : `${a.name}${a.label ? `\n${a.label}` : ''}`, String(a.months), `${monthLabel(a.start)} – ${monthLabel(a.start + a.months)}`, a.details.filter((d) => d.trim()).join('\n'), a.milestone ?? '']),
      { widths: [26, 8, 13, 35, 18], size: 17 },
    ),
    para(`Milestones: ${pertMilestones(p).map((m) => `${monthLabel(m.month)} ${m.label}`).join(' · ')}.`, { size: 16, before: 120 }),
    para(`Critical path: ${criticalPath(p)}`, { size: 16, before: 60 }),
    ...(p.note ? [para(p.note, { size: 16, italics: true, before: 60 })] : []),
    para(`Months are counted from the zero date (${p.zeroDate}). Pre-award activities are shown before M0 and are not counted in the ${p.completionMonths}-month completion period.`, { size: 16, italics: true, before: 120 }),
  ];

  // ---- 5. grid map, 6. BCR ----
  const attachment = (a: (typeof ANNEXURES)[number]) => {
    const files = filesFor(a.docs);
    return [chapter(`${a.no}.`, a.title), para(files.length ? `Enclosed: ${files.join(', ')}.` : '[To be enclosed: not yet attached in Documents.]', { italics: !files.length })];
  };
  const kptcl = f.method === 'kptcl';
  const inputs = f.inputs ?? DEFAULT_BCR_INPUTS;
  const appraisal = kptcl ? kptclAppraisal(g.total, inputs) : null;
  const bcrAnnex = [
    chapter('6.', 'Financial BCR'),
    para(D.nameOfWork || dpr.project, { size: 19, after: 120 }),
    kpiStrip(),
    para('', { after: 120 }),
    ...(kptcl && appraisal
      ? [
          minor('Input parameters'),
          table(
            ['Parameter', 'Value', 'Note'],
            [
              ['Additional load after enhancement', `${inputs.addedMva} MVA`, 'Net additional MVA on the station.'],
              ['DPR / project cost', `${inr(g.total)} Lakhs`, 'From cost estimates and fees, inclusive of GST.'],
              ['Energy savings', `${inputs.energySavingsMu} MU`, 'Applicable for new stations where savings are derived.'],
              ['Sale price of energy', `${inputs.salePrice} Rs./Unit`, 'ESCOM sale price, fixed each financial year.'],
              ['Transmission charges', `${inputs.transmissionCharge} Rs./Unit`, 'KPTCL charges, fixed each financial year.'],
              ['Load growth', `${inputs.loadGrowthPct} %`, 'Per local growth trend.'],
              ['Discount rate', `${inputs.discountRatePct} %`, 'Typically 9–12% depending on financing.'],
              ['O & M cost', `${inputs.omPct} %`, 'Of total project cost, per annum.'],
            ],
            { widths: [35, 20, 45] },
          ),
          minor('Appraisal summary'),
          table(
            ['Item', 'Value'],
            [
              ['NPV of benefits', `${inr(appraisal.npvBenefits)} L`],
              ['NPV of capital outflow', `-${inr(appraisal.npvCapital)} L`],
              ['Minimum capital requirement (MCR)', `${inr(appraisal.mcr)} L`],
              ['B/C — NPV ÷ MCR + 1 (method 1)', appraisal.bcrMethod1.toFixed(2)],
              ['B/C — NPV benefits ÷ NPV capital (method 2)', appraisal.bcr.toFixed(2)],
              ['Total undiscounted income', `${inr(appraisal.totalIncome, 0)} L`],
            ],
            { numeric: [1], widths: [70, 30] },
          ),
          para(`Escalation on energy and transmission charges is applied at ${inputs.escalationPct}% per annum over a ${appraisal.schedule.length}-year horizon.`, { size: 17, italics: true, before: 120 }),
          minor('Year-wise schedule · all figures in lakhs unless noted'),
          table(
            ['Year', 'Energy chg', 'Trans. chg', 'Savings', 'Addl. sale', 'Addl. savings', 'Income', 'Cash flow', 'Disc. factor', 'Discounted CF', 'Cumulative DCF'],
            [
              ['0', '—', '—', '—', '—', '—', '—', inr(-g.total), '1.0000', inr(-g.total), inr(-g.total)],
              ...appraisal.schedule.map((y) => [
                String(y.year),
                inr(y.energyCharge),
                inr(y.transmissionCharge, 3),
                inr(y.savings),
                inr(y.additionalSaleMu, 3),
                inr(y.additionalSavings),
                inr(y.income),
                inr(y.cashFlow),
                y.discountFactor.toFixed(4),
                inr(y.discountedCashFlow),
                inr(y.cumulative),
              ]),
            ],
            { numeric: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], size: 15 },
          ),
          para(
            'BCR = NPV of benefits ÷ NPV of capital outflow. Payback period is the first full year in which cumulative discounted cash flow turns positive. IRR is the discount rate at which NPV of the cash-flow stream equals zero. Method and escalation assumptions follow the KPTCL BCR workbook.',
            { size: 16, italics: true, before: 120 },
          ),
        ]
      : f.benefits.length
        ? (() => {
            const rate = f.discountRatePct / 100;
            let cumulative = 0;
            return [
              para(`Discount rate ${f.discountRatePct}%. Benefits entered by hand.`, { size: 18 }),
              table(
                ['Year', 'Benefit (Rs lakh)', 'Discount factor', 'Present value', 'Cumulative present value'],
                f.benefits.map((b, i) => {
                  const factor = 1 / (1 + rate) ** (i + 1);
                  cumulative += b * factor;
                  return [String(i + 1), inr(b), factor.toFixed(4), inr(b * factor), inr(cumulative)];
                }),
                { numeric: [1, 2, 3, 4] },
              ),
            ];
          })()
        : [para('[BCR inputs not entered yet.]', { italics: true })]),
  ];

  const tail = ANNEXURES.filter((a) => !a.generated && a.no !== '5').flatMap((a, i) => [...(i ? [pageBreak()] : []), ...attachment(a)]);

  const portrait = { margin: { top: 1200, bottom: 1100, left: 1200, right: 1100 } };
  const landscape = { ...portrait, size: { orientation: PageOrientation.LANDSCAPE } };
  const hf = { headers: { default: header }, footers: { default: footer } };
  return new d.Document({
    creator: 'DPR Manager',
    title: `DPR ${dpr.id}: ${dpr.project}`,
    styles: { default: { document: { run: { font: 'Arial', size: 21 } } } },
    sections: [
      { properties: { titlePage: true, page: portrait }, headers: { default: header, first: new Header({ children: [] }) }, footers: { default: footer, first: new Footer({ children: [] }) }, children: [...cover, ...contents, ...glance, ...report, ...estimates] },
      { properties: { page: landscape }, ...hf, children: landscapeEstimates },
      { properties: { page: landscape }, ...hf, children: pert },
      { properties: { page: portrait }, ...hf, children: attachment(ANNEXURES[2]) },
      ...(noBcr ? [] : [{ properties: { page: kptcl ? landscape : portrait }, ...hf, children: bcrAnnex }]),
      { properties: { page: portrait }, ...hf, children: tail },
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
  a.download = `DPR_${input.dpr.id.replace(/\W+/g, '-')}${input.version ? `_v${input.version}` : ''}${input.gaps.length ? '_DRAFT' : ''}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
