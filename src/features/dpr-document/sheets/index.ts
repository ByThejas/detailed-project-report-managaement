import type { DprRow } from '@/features/reports/types';
import type { Estimate } from '@/features/preparation/types';
import { generalAbstract } from '@/features/preparation/calc';
import { DEFAULT_BCR_INPUTS, DEFAULT_FINANCIALS, isBcrExempt, kptclAppraisal, summariseFinancials } from '@/features/preparation/finance';
import { hasLineWorks } from '@/features/preparation/calc';
import { DETAIL_FIELDS, applies, contentOf, letteredSections, lineScale, type DprContent, type SimpleTable } from '../content';
import { ANNEXURES } from '../buildDocx';
import { coverPart, coverSheetHtml, type CoverData } from './cover';
import { pertPart, pertSheetHtml, type PertSheetData } from './pert';
import { bcrPart, bcrSheetHtml, type BcrSheetData } from './bcr';
import { narrativeCss, narrativeHtml, type NarrativeBlock, type NarrativeData, type NarrativeSection } from './narrative';
import { assetBase, fontFaces, sheetDocument, type SheetPart } from './shared';

export { openSheet } from './shared';

export interface SheetSet {
  cover: CoverData;
  pert: PertSheetData;
  /** Null when the DPR has no KPTCL-method BCR to print; `bcrWhy` says why. */
  bcr: BcrSheetData | null;
  bcrWhy?: string;
  /** Contents, glance and report pages. */
  text: NarrativeData;
  /** Short name for file titles. */
  name: string;
}

const CONDUCTORS = /\b(coyote|lynx|drake|panther|zebra|moose|wolf|dog|rabbit|kundah|deer|hpc|htls|accc|aaac)\b/i;

/** "Brown Field — Additional Transformer + LILO" → site and work, as the cover generator keeps them. */
function splitNature(nature: string, stream: string): { site: string; work: string } {
  const [site, ...rest] = nature.split(/\s*[—–-]{1,2}\s+/);
  if (rest.length) return { site: site!.trim(), work: rest.join(' — ').trim() };
  if (/field/i.test(nature)) return { site: nature.trim(), work: '' };
  return { site: stream === 'Greenfield' ? 'Green Field' : 'Brown Field', work: nature.trim() };
}

/** Everything the three printable sheets need, from the DPR and its estimate. */
export function sheetSet(dpr: DprRow, estimate: Estimate, now = new Date()): SheetSet {
  const content = contentOf(dpr, estimate);
  const D = content.details;
  const cost = generalAbstract(estimate).total;
  const f = estimate.financials ?? DEFAULT_FINANCIALS;
  const fin = summariseFinancials(cost, f);
  const noBcr = isBcrExempt(estimate);
  const nameOfWork = (D.nameOfWork || dpr.project).trim();
  const { site, work } = splitNature(D.projectNature || '', dpr.stream);
  const scale = noBcr ? lineScale(content) : null;
  const conductor = [D.lineComponent, D.lineEstimateTitle, nameOfWork].map((t) => t?.match(CONDUCTORS)?.[1]).find(Boolean);

  const cover: CoverData = {
    kind: noBcr ? 'line' : 'substation',
    code: [D.apwCode, D.financialYear].filter((v) => v?.trim()).join(', '),
    title: (D.coverTitle || nameOfWork).trim(),
    location: (D.coverSubtitle || '').trim(),
    zone: (D.jurisdiction || '').trim(),
    site,
    work,
    cost: cost > 0 ? cost.toFixed(2) : '',
    bcr: fin.bcr === null ? '' : fin.bcr.toFixed(2),
    irr: fin.irr === null ? '' : f.method === 'kptcl' ? `${Math.round(fin.irr * 100)}%` : `${(fin.irr * 100).toFixed(1)}%`,
    payback: fin.discountedPayback === null ? '' : `${fin.discountedPayback} Years`,
    conductor: conductor ? conductor[0]!.toUpperCase() + conductor.slice(1).toLowerCase() : '',
    route: scale && scale.route !== '—' ? scale.route : '',
    preparedBy: (D.preparedBy || '').trim(),
    preparedByRole: (D.preparedByRole || '').trim(),
    status: '',
    date: (D.reportMonth || now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })).trim(),
  };

  const pert: PertSheetData = { plan: content.pert, title: nameOfWork, voltage: dpr.voltage };

  let bcr: BcrSheetData | null = null;
  let bcrWhy: string | undefined;
  const inputs = f.inputs ?? DEFAULT_BCR_INPUTS;
  if (noBcr) bcrWhy = 'Pure line works carry no BCR (ADR-0007).';
  else if (f.method !== 'kptcl') bcrWhy = 'The BCR sheet follows the KPTCL calculator; switch the BCR to the KPTCL method.';
  else if (cost <= 0) bcrWhy = 'The estimate has no total yet.';
  else if (!(inputs.addedMva > 0) && !(inputs.energySavingsMu > 0)) bcrWhy = 'Enter the added MVA or energy savings in the BCR step.';
  else {
    const appraisal = kptclAppraisal(cost, inputs);
    if (appraisal) bcr = { title: nameOfWork, cost, inputs, appraisal };
    else bcrWhy = 'The BCR could not be worked out.';
  }

  const notYet = 'Not calculated';
  const figures = {
    bcr: cover.bcr || notYet,
    irr: cover.irr || notYet,
    payback: cover.payback || notYet,
  };
  const text = narrativeData(dpr, content, { cost, noBcr, lineWorks: hasLineWorks(estimate), figures });

  const name = (dpr.station || dpr.location || dpr.id).split(',')[0]!.trim();
  return { cover, pert, bcr, bcrWhy, text, name };
}

export const coverHtml = (s: SheetSet) => coverSheetHtml(s.cover, `Cover - ${s.name}`);
export const pertHtml = (s: SheetSet) => pertSheetHtml(s.pert, `PERT chart - ${s.name}`);
export const bcrHtml = (s: SheetSet) => (s.bcr ? bcrSheetHtml(s.bcr, `BCR analysis - ${s.name}`) : null);

const inrLakh = (n: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Report text as blocks: a blank line starts a paragraph, "1. …" starts a numbered point, {table} places the table. */
export function textBlocks(body: string, table?: NarrativeBlock | null): NarrativeBlock[] {
  const out: NarrativeBlock[] = [];
  let placed = false;
  for (const raw of body.split(/\n\s*\n|\n(?=\s*\d+\.\s)|\n(?=\s*\{table\}\s*(?:\n|$))/)) {
    const chunk = raw.trim();
    if (!chunk) continue;
    if (/^\{table\}$/i.test(chunk)) {
      if (table && !placed) out.push(table);
      placed = true;
      continue;
    }
    const m = /^(\d+\.)\s+([\s\S]*)$/.exec(chunk);
    out.push(m ? { t: 'n', n: m[1]!, text: m[2]! } : { t: 'p', text: chunk });
  }
  if (table && !placed) out.push(table);
  return out;
}

/** The stations-on-the-line and tower tables, boxed as in the Thyavanige DPR, with a total under the towers. */
function gridOf(t: SimpleTable, key: 'existing' | 'towers'): NarrativeBlock | null {
  const rows = t.rows.filter((r) => r.slice(1).some((c) => c.trim()));
  if (!rows.length) return null;
  const n = t.columns.length;
  const last = n - 1;
  const counts = rows.map((r) => Number((r[last] ?? '').replace(/,/g, '').trim()));
  const hasTotal = rows.some((r) => r.slice(0, last).some((c) => /^total$/i.test(c.trim())));
  const towers = key === 'towers' && counts.every((c) => Number.isFinite(c));
  const total = towers && !hasTotal && rows.length > 1 && n >= 2 ? [[...Array<string>(n - 2).fill(''), 'Total', String(counts.reduce((a, c) => a + c, 0))]] : [];
  const withTotal = [...rows, ...total];
  const widths = key === 'existing' && n === 4 ? [9.8, 27.6, 39.1, 23.5] : key === 'towers' && n === 3 ? [9.8, 74.8, 15.4] : undefined;
  return {
    t: 'grid',
    title: t.title,
    columns: t.columns,
    rows: withTotal,
    widths,
    numeric: towers ? [last] : undefined,
    boldRows: withTotal.flatMap((r, i) => (r.some((c) => /^total$/i.test(c.trim())) ? [i] : [])),
  };
}

/** Contents, glance and report pages from the DPR's text, in the Thyavanige DPR's order. */
export function narrativeData(
  dpr: DprRow,
  content: DprContent,
  o: { cost: number; noBcr: boolean; lineWorks: boolean; figures: { bcr: string; irr: string; payback: string } },
): NarrativeData {
  const D = content.details;
  const sectionsHere = letteredSections(o.lineWorks, o.noBcr);
  const salientLetter = String.fromCharCode(97 + sectionsHere.length);
  const contents: NarrativeData['contents'] = [
    { label: '1.', title: 'Project at a glance', level: 0 },
    { label: '2.', title: 'Project report', level: 0 },
    ...sectionsHere.flatMap((s) => [
      { label: `${s.letter}.`, title: s.group, level: 1 as const },
      ...(s.parts.length > 1 ? s.parts.map((p) => ({ label: 'sub' in p ? p.sub.split(' ')[0]! : '', title: p.title, level: 2 as const })) : []),
    ]),
    { label: `${salientLetter}.`, title: 'Salient features', level: 1 },
    ...ANNEXURES.filter((a) => !(o.noBcr && a.no === '6')).map((a) => ({ label: `${a.no}.`, title: a.title, level: 0 as const })),
  ];

  const glance: [string, string][] = DETAIL_FIELDS.filter((x) => x.group === 'glance' && applies(x, o.lineWorks)).map((x) => [x.label, D[x.key] ?? '']);
  glance.splice(glance.length - 1, 0, ['Cost of DPR', o.cost > 0 ? `${inrLakh(o.cost)} Lakh` : '']);

  const scale = o.noBcr ? lineScale(content) : null;
  const kpi: [string, string][] = scale
    ? [['Route length', scale.route], ['Towers', scale.towers], ['Terminal bays', scale.bays]]
    : [['Benefit–cost ratio', o.figures.bcr], ['Internal rate of return', o.figures.irr], ['Payback period', o.figures.payback.toLowerCase()]];

  const report: NarrativeSection[] = sectionsHere.map((s) => ({
    letter: s.letter,
    title: s.group,
    blocks: s.parts.flatMap((p): NarrativeBlock[] => {
      const head: NarrativeBlock[] = 'sub' in p ? [{ t: 'sub', text: p.sub }] : [];
      const table = p.key === 'existing' ? gridOf(content.tables.existing, 'existing') : p.key === 'towers' ? gridOf(content.tables.towers, 'towers') : null;
      const blocks = textBlocks(content.sections[p.key] ?? '', table);
      if (p.key === 'costBenefit')
        blocks.push({ t: 'lv', w1: 61.3, boldValues: true, blankAfter: true, rows: [['Benefit–cost ratio (BCR)', o.figures.bcr], ['Internal rate of return (IRR)', o.figures.irr], ['Payback period', o.figures.payback]] });
      return [...head, ...blocks];
    }),
  }));
  report.push({ letter: salientLetter, title: 'Salient features', blocks: [{ t: 'lv', w1: 30.27, rows: content.salient.map((r) => [r.label, r.value]) }] });

  const loc = (D.location || '').split(';');
  const subline = (loc.length > 1 ? loc[loc.length - 1]! : D.jurisdiction || '').trim();
  return { running: (D.runningTitle || dpr.project).trim(), title: (D.nameOfWork || dpr.project).trim(), subline, contents, glance, kpi, report };
}

/** Bookman Old Style where installed (Windows with Office), else the bundled URW Bookman. */
const BOOKMAN = 'DPR Bookman';
function bookmanFaces(base: string): string {
  const fonts = new URL('../fonts/', base).href;
  return [
    `@font-face { font-family: '${BOOKMAN}'; font-weight: 400; font-display: block; src: local('Bookman Old Style'), local('BookmanOldStyle'), url("${fonts}URWBookman-Light.ttf") format('truetype'); }`,
    `@font-face { font-family: '${BOOKMAN}'; font-weight: 700; font-display: block; src: local('Bookman Old Style Bold'), local('BookmanOldStyle-Bold'), url("${fonts}URWBookman-Demi.ttf") format('truetype'); }`,
  ].join('\n');
}

/**
 * The whole printable DPR in the Thyavanige order of its own pages: the A4 cover, the contents, glance and
 * report pages (Letter, as the Thyavanige PDF), then the PERT chart and the BCR (A4 landscape). The
 * estimates and the attached annexures are put in between when the final DPR is built.
 */
export function dprHtml(s: SheetSet): string {
  const base = assetBase();
  const parts: SheetPart[] = [coverPart(s.cover, base), pertPart(s.pert, base), ...(s.bcr ? [bcrPart(s.bcr, base)] : [])];
  const [cover, pert, bcr] = parts;
  return sheetDocument({
    title: `DPR - ${s.name}`,
    fonts: `${fontFaces(parts.flatMap((p) => p.fonts), base)}\n${bookmanFaces(base)}`,
    css: `${parts.map((p) => p.css).join('\n')}\n${narrativeCss(`'${BOOKMAN}', 'Bookman Old Style', serif`, s.text.running)}`,
    pages: [...cover!.pages, { flow: narrativeHtml(s.text) }, ...pert!.pages, ...(bcr ? bcr.pages : [])],
    script: parts.map((p) => p.script ?? '').join('\n'),
    note: 'Print with Chrome or Edge: Destination “Save as PDF”, Margins “Default”, Scale 100%, Headers and footers off.',
  });
}

/** Page counts of the printed DPR, so the final DPR can slot the estimates and annexures between them. */
export const dprFixedPages = (s: SheetSet) => ({ before: 1, after: 1 + (s.bcr ? 2 : 0) });
