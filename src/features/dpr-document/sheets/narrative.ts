import { esc } from './shared';

/**
 * The DPR's own text pages (contents, "01 Project at a glance", "02 Project report" a to n), laid out like
 * pages 2 to 10 of the Thyavanige DPR. Those pages came from the KPTCL narrative template
 * (dpr_builder.py over 00_DPR_Narrative_Master_Template.docx: Bookman Old Style, A4, page border, hairline
 * tables) printed on US Letter, which shrank the A4 page to 94.07% and centred it. The measures below are
 * the template's Word measures times that factor, checked against the PDF.
 *
 * The text flows through the browser's own page breaking (CSS paged media), so long sections run on to the
 * next page the way Word runs them; header, footer and page border come from the @page rule.
 */

export interface NarrativeBlockP {
  t: 'p';
  text: string;
}
export interface NarrativeBlockNum {
  t: 'n';
  n: string;
  text: string;
}
export interface NarrativeBlockSub {
  t: 'sub';
  text: string;
}
/** A boxed table ("Table Grid"), e.g. the stations on the line or the tower types. */
export interface NarrativeBlockGrid {
  t: 'grid';
  title?: string;
  columns: string[];
  rows: string[][];
  /** Column widths in % of the text width. */
  widths?: number[];
  /** Columns printed right-aligned (counts). */
  numeric?: number[];
  /** Rows printed bold, e.g. a total. */
  boldRows?: number[];
}
/** A label/value table with hairlines (glance, salient features, BCR summary). */
export interface NarrativeBlockLv {
  t: 'lv';
  /** An empty line after the table (the BCR summary has one before the next heading). */
  blankAfter?: boolean;
  rows: [string, string][];
  /** Label column width in % of the table. */
  w1: number;
  boldValues?: boolean;
}
export type NarrativeBlock = NarrativeBlockP | NarrativeBlockNum | NarrativeBlockSub | NarrativeBlockGrid | NarrativeBlockLv;

export interface NarrativeSection {
  letter: string;
  title: string;
  blocks: NarrativeBlock[];
}

export interface NarrativeData {
  /** Page footer, printed in capitals. */
  running: string;
  /** Name of work, at the top of the contents page. */
  title: string;
  /** Line under the title, e.g. "Operations Division, Benkikere, Tumakuru Operations Zone". */
  subline: string;
  contents: { label: string; title: string; level: 0 | 1 | 2 }[];
  glance: [string, string][];
  /** The three figures under the glance table: BCR, IRR and payback (or route, towers and bays). */
  kpi: [string, string][];
  report: NarrativeSection[];
}

/** Letter-paper measure (pt) of a Word measure in points on the A4 template. */
const K = 0.9407;
const pt = (word: number) => `${(word * K).toFixed(2)}pt`;
/** Word's single line for Bookman Old Style (hhea ascent + descent). */
const SINGLE = 1.1724;
/** Word puts the extra of 1.5 line spacing under each line; CSS splits it. Lift the text by half of it. */
const lift = (fontWord: number, multiple: number) => `${(((multiple - 1) * SINGLE * fontWord * K) / 2).toFixed(2)}pt`;

const BODY = '#1F1E1B';
const ACCENT = '#1E4D6B';
const MUTED = '#7C776C';
const HAIR = '#E5E2DA';

/** The page border and the header and footer rules, drawn once per page as the page background. */
const PAGE_ART = `<svg xmlns='http://www.w3.org/2000/svg' width='612' height='792' viewBox='0 0 612 792'><rect x='48.92' y='23.03' width='513.56' height='745.37' fill='none' stroke='#000' stroke-width='0.85'/><rect x='78.7' y='41' width='454' height='0.5' fill='#D7D4CC'/><rect x='78.7' y='749.9' width='454' height='0.5' fill='#D7D4CC'/></svg>`;
const svgUrl = (svg: string) => `url("data:image/svg+xml,${svg.replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}")`;

/** Text area of the Letter page, as measured on the PDF. */
const M = { top: 66.7, left: 80.0, right: 80.4, bottom: 54.2 };
/** Tables reach 4.7pt past the right margin (Word's table indent); the page keeps room for that so the browser doesn't shrink the page to fit. */
const SPILL = 6;

/** Word sets each glyph on a twip grid, which comes out about 0.024pt narrower per glyph than the font's own advance. */
const TRACK = -0.012;
const track = (word: number) => `${(word * K + TRACK).toFixed(3)}pt`;

const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;

export function narrativeCss(font: string, running: string): string {
  const marginText = `font-family: ${font}; font-size: 7.09pt; letter-spacing: 1pt; text-transform: uppercase; color: ${MUTED}; white-space: nowrap;`;
  return `
@page dpr-text {
  size: 612pt 792pt;
  margin: ${M.top}pt ${M.right - SPILL}pt ${M.bottom}pt ${M.left}pt;
  background: ${svgUrl(PAGE_ART)} -${M.left}pt -${M.top}pt / 612pt 792pt no-repeat;
  @top-left { content: "Karnataka Power Transmission Corporation Ltd."; ${marginText} vertical-align: top; padding-top: 28.1pt; line-height: 8.4pt; }
  @top-right { content: "Detailed Project Report"; ${marginText} text-align: right; vertical-align: top; padding-right: ${SPILL - 0.3}pt; padding-top: 28.1pt; line-height: 8.4pt; }
  @bottom-left { content: ${quote(running)}; ${marginText} letter-spacing: 0.965pt; vertical-align: top; padding-top: calc(0.16in + 4.8pt); line-height: 8.4pt; width: 460pt; }
}
.dpr-text { page: dpr-text; --squeeze: -0.75pt; font-kerning: none; font-variant-ligatures: none; letter-spacing: ${TRACK}pt; padding-right: ${SPILL}pt; font-family: ${font}; font-size: ${pt(11)}; color: ${BODY}; line-height: ${pt(11 * SINGLE * 1.5)}; }
.dpr-text * { box-sizing: border-box; }
.dpr-text p { margin: 0 0 ${pt(6)}; }
.dpr-text .r { position: relative; top: -${lift(11, 1.5)}; }
.dpr-text .body { text-align: justify; word-spacing: var(--squeeze); }
.dpr-text .num { text-align: justify; word-spacing: var(--squeeze); padding-left: ${pt(21.25)}; text-indent: -${pt(21.25)}; }
.dpr-text .num .nn { display: inline-block; width: ${pt(21.25)}; text-indent: 0; }
.dpr-text .keep { break-inside: avoid; }
.dpr-text .newpage { break-before: page; }
.dpr-text h1, .dpr-text h2 { margin: 0 0 ${pt(8)}; font-weight: 700; color: ${BODY}; text-align: left; break-after: avoid; white-space: pre; }
.dpr-text h1 { font-size: ${pt(13)}; line-height: ${pt(13 * SINGLE * 1.5)}; }
.dpr-text h1 .r { top: -${lift(13, 1.5)}; }
.dpr-text h1 .no { color: ${ACCENT}; font-size: ${pt(12)}; }
.dpr-text h2 { margin-top: calc(${pt(16)} + 0.6pt); margin-bottom: calc(${pt(8)} - 1.5pt); font-size: ${pt(13)}; line-height: ${pt(14 * SINGLE * 1.5)}; }
.dpr-text h2 .r { top: -${lift(14, 1.5)}; }
.dpr-text h2 .no { color: ${ACCENT}; font-size: ${pt(14)}; }
.dpr-text .sp { color: ${ACCENT}; font-size: ${pt(11)}; }
.dpr-text .ruled { border-bottom: 2px solid ${BODY}; padding-bottom: ${pt(4)}; margin-left: -1.3pt; padding-left: 1.3pt; margin-right: -1.1pt; }
.dpr-text .first { margin-top: 0; }
.dpr-text .sub { margin: ${pt(10)} 0 ${pt(4)}; font-size: ${pt(9.5)}; font-weight: 700; color: #000; letter-spacing: ${track(1)}; text-transform: uppercase; line-height: ${pt(9.5 * SINGLE * 1.5)}; text-align: justify; break-after: avoid; }
.dpr-text .sub .r { top: -${lift(9.5, 1.5)}; }
.dpr-text .sub .gap { white-space: pre; }
.dpr-text .sub .lc { text-transform: none; }
.dpr-text .blank { height: ${pt(11 * SINGLE * 1.5)}; margin: 0 0 ${pt(6)}; }

/* Boxed tables (Word "Table Grid") */
.dpr-text table { border-collapse: collapse; table-layout: fixed; }
.dpr-text .grid { width: 100%; margin: 0; }
.dpr-text .grid td, .dpr-text .grid th { border: ${pt(0.5)} solid #000; padding: 0.3pt ${pt(5.4)} 0.6pt; font-size: ${pt(10)}; line-height: ${pt(11 * SINGLE)}; vertical-align: top; text-align: left; font-weight: 400; color: ${BODY}; overflow-wrap: anywhere; }
.dpr-text .grid th { font-weight: 700; color: #000; }
.dpr-text .grid .b td { font-weight: 700; }
.dpr-text .grid .num { text-align: right; padding-left: ${pt(5.4)}; text-indent: 0; }
.dpr-text .grid tr { break-inside: avoid; }

/* Hairline label/value tables (glance, salient features) */
.dpr-text .lv { width: calc(100% + 0.01pt); margin: 0 -${pt(5)} 0 ${pt(5)}; }
.dpr-text .lv td { border-bottom: ${pt(0.5)} solid ${HAIR}; padding: ${pt(4)} ${pt(5)} calc(${pt(4)} + ${pt(2)}); font-size: ${pt(10)}; line-height: ${pt(10 * SINGLE)}; vertical-align: top; text-align: left; overflow-wrap: anywhere; }
.dpr-text .lv td:first-child { text-transform: uppercase; letter-spacing: ${track(0.7)}; color: #000; }
.dpr-text .lv.bold td:last-child { font-weight: 700; }
.dpr-text .lv tr { break-inside: avoid; }

/* Figures under the glance table */
.dpr-text .kpi { width: 100%; }
.dpr-text .kpi td { border-bottom: ${pt(0.5)} solid ${HAIR}; padding: ${pt(4)} ${pt(5)} calc(${pt(4)} + ${pt(2)}); font-weight: 700; vertical-align: top; text-align: left; }
.dpr-text .kpi tr:first-child td { font-size: ${pt(10)}; line-height: ${pt(10 * SINGLE)}; color: #000; }
.dpr-text .kpi tr + tr td { font-size: ${pt(16)}; line-height: ${pt(16 * SINGLE)}; }

/* Title block and contents */
.dpr-text .cv { margin: 0 -${pt(5)} 0 ${pt(5)}; padding: ${pt(4)} ${pt(5)}; text-align: center; }
.dpr-text .cv-h { margin: 0 0 ${pt(13)}; font-size: ${pt(14)}; line-height: ${pt(14 * SINGLE)}; font-weight: 700; color: ${ACCENT}; letter-spacing: ${track(2)}; text-transform: uppercase; text-decoration: underline; text-decoration-thickness: 0.8pt; text-underline-offset: 2.2pt; }
.dpr-text .cv-t { margin: 0 0 12.4pt; font-size: ${pt(14)}; line-height: 17pt; font-weight: 700; }
.dpr-text .cv-t .r { top: 0.9pt; }
.dpr-text .cv-s { margin: 0 0 84.3pt; line-height: ${pt(11 * SINGLE)}; color: #4B4740; }
.dpr-text .toc-h { margin: 0 0 ${pt(6)}; font-weight: 700; color: ${ACCENT}; letter-spacing: ${track(2)}; text-transform: uppercase; text-align: left; }
.dpr-text .toc { margin: 0 -${pt(5)} 0 ${pt(5)}; }
.dpr-text .toc > div { position: relative; height: 22pt; border-bottom: ${pt(0.5)} solid ${HAIR}; break-inside: avoid; }
.dpr-text .toc > .l0 { margin-right: 11pt; }
.dpr-text .toc .lb { position: absolute; top: ${pt(4)}; font-size: ${pt(9)}; line-height: ${pt(9 * SINGLE)}; color: #000; }
.dpr-text .toc .tt { position: absolute; top: ${pt(4)}; right: 4.7pt; font-size: ${pt(11)}; line-height: ${pt(11 * SINGLE)}; }
.dpr-text .toc .l0 .lb { left: 4.7pt; } .dpr-text .toc .l0 .tt { left: 74.5pt; }
.dpr-text .toc .l1 .lb { left: 73.2pt; } .dpr-text .toc .l1 .tt { left: 115.2pt; }
.dpr-text .toc .l2 .lb { left: 93.1pt; } .dpr-text .toc .l2 .tt { left: 158.2pt; }

@media screen {
  .dpr-text { width: 612pt; margin: 0 auto 24px; padding: ${M.top}pt ${M.right - SPILL}pt ${M.bottom}pt ${M.left}pt; background: #fff; box-shadow: 0 2px 14px rgba(20,20,19,.18); }
}
`;
}

/** Text with line breaks kept. */
const lines = (t: string) => esc(t.trim()).replace(/\n/g, '<br>');

function grid(b: NarrativeBlockGrid): string {
  const n = b.columns.length;
  const widths = b.widths && b.widths.length === n ? b.widths : null;
  const cols = widths ? `<colgroup>${widths.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>` : '';
  const cls = (i: number) => (b.numeric?.includes(i) ? ' class="num"' : '');
  const head = `<tr>${b.columns.map((c) => `<th>${lines(c)}</th>`).join('')}</tr>`;
  const body = b.rows.map((r, ri) => `<tr${b.boldRows?.includes(ri) ? ' class="b"' : ''}>${r.map((c, i) => `<td${cls(i)}>${lines(c)}</td>`).join('')}</tr>`).join('');
  return `<table class="grid">${cols}${head}${body}</table>`;
}

function lv(b: NarrativeBlockLv): string {
  const w1 = b.w1.toFixed(2);
  return `<table class="lv${b.boldValues ? ' bold' : ''}"><colgroup><col style="width:${w1}%"><col></colgroup>${b.rows
    .map(([k, v]) => `<tr><td>${lines(k)}</td><td>${lines(v || '—')}</td></tr>`)
    .join('')}</table>`;
}

const sub = (text: string) => {
  const m = /^(\S+\))\s+(.*)$/.exec(text.trim());
  return `<div class="sub"><span class="r">${m ? `<span class="lc">${esc(m[1])}</span><span class="gap">   </span>${esc(m[2])}` : esc(text)}</span></div>`;
};

function block(b: NarrativeBlock): string {
  switch (b.t) {
    case 'p':
      return `<p class="body"><span class="r">${lines(b.text)}</span></p>`;
    case 'n':
      return `<p class="num"><span class="r"><span class="nn">${esc(b.n)}</span>${lines(b.text)}</span></p>`;
    case 'sub':
      return sub(b.text);
    case 'grid':
      return b.title ? `<div class="keep">${sub(b.title)}${grid(b)}</div>` : grid(b);
    case 'lv':
      return `${lv(b)}${b.blankAfter ? '<div class="blank"></div>' : ''}`;
  }
}

/** A heading keeps its whole first block with it, as the Thyavanige DPR's page breaks do. */
function section(s: NarrativeSection, first: boolean): string {
  const head = `<h2 class="ruled${first ? ' first' : ''}"><span class="r"><span class="no">${esc(s.letter)}.</span><span class="sp">   </span>${esc(s.title.toUpperCase())}</span></h2>`;
  const [b0, ...rest] = s.blocks;
  const lead = b0 && b0.t === 'sub' && rest[0] ? `${block(b0)}${block(rest.shift()!)}` : b0 ? block(b0) : '';
  // A titled table keeps the point after it on the same page (the Thyavanige DPR's page 6).
  const body: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const b = rest[i]!;
    const next = rest[i + 1];
    if (b.t === 'grid' && b.title && next && next.t !== 'grid') {
      body.push(`<div class="keep">${block(b)}<div class="blank"></div>${block(next)}</div>`);
      i++;
    } else body.push(block(b));
  }
  return `<div class="keep">${head}${lead}</div>${body.join('')}`;
}

const top = (no: string, title: string, ruled: boolean) =>
  `<h1 class="newpage${ruled ? ' ruled' : ''}"><span class="r"><span class="no">${esc(no)}</span><span class="sp">   </span>${esc(title.toUpperCase())}</span></h1>`;

/** The contents, glance and report pages, as one flowing block for the print document. */
export function narrativeHtml(d: NarrativeData): string {
  const toc = d.contents.map((c) => `<div class="l${c.level}"><span class="lb">${esc(c.label)}</span><span class="tt">${esc(c.title)}</span></div>`).join('');
  const kpi = d.kpi.length
    ? `<div class="blank"></div><table class="kpi"><tr>${d.kpi.map(([k]) => `<td>${esc(k)}</td>`).join('')}</tr><tr>${d.kpi.map(([, v]) => `<td>${esc(v || '—')}</td>`).join('')}</tr></table>`
    : '';
  return `<div class="dpr-text">
<div class="cv"><p class="cv-h">Detailed Project Report</p><p class="cv-t"><span class="r">${lines(d.title)}</span></p>${d.subline.trim() ? `<p class="cv-s">${lines(d.subline)}</p>` : '<div style="height:87.6pt"></div>'}</div>
<p class="toc-h"><span class="r">Contents</span></p>
<div class="toc">${toc}</div>
${top('01', 'Project at a glance', true)}
${lv({ t: 'lv', rows: d.glance, w1: 34.4 })}
${kpi}
${top('02', 'Project report', !d.report.length)}
${d.report.map((s, i) => section(s, i === 0)).join('\n')}
</div>`;
}
