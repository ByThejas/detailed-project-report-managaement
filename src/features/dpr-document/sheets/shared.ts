/**
 * Shared pieces of the printable sheets (cover, PERT chart, BCR analysis). Each sheet is a complete HTML
 * page that copies the markup and CSS of the KPTCL tool that drew the matching page of the Thyavanige DPR:
 * the cover generator (cover_render.html), the PERT chart generator and the BCR calculator (12-09-2026).
 * Printing the page from the browser gives the same PDF those tools gave.
 */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]!);

/** Where the sheet fonts and logos live (public/sheets), as an absolute URL so a blob page can load them. */
export function assetBase(): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  const origin = typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null' ? window.location.origin : 'http://localhost';
  return new URL(`${base.replace(/\/?$/, '/')}sheets/`, origin).href;
}

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

export type Face = { family: string; weight: string; file: string; range?: string };

/** The same font files the tools embed (Google Fonts subsets, SIL Open Font License). latin-ext carries the ₹ sign. */
const pair = (family: string, weights: string[], name: (w: string) => string): Face[] =>
  weights.flatMap((w) => [
    { family, weight: w, file: `${name(w)}-latin.woff2`, range: LATIN },
    { family, weight: w, file: `${name(w)}-latin-ext.woff2`, range: LATIN_EXT },
  ]);

export const FONTS = {
  plexMono: pair('IBM Plex Mono', ['400', '500', '600'], (w) => `plex-mono-${w}`),
  plexSans: pair('IBM Plex Sans', ['400', '500', '600', '700'], () => 'plex-sans'),
  plexSerif: pair('IBM Plex Serif', ['500', '600'], (w) => `plex-serif-${w}`),
  archivo: pair('Archivo', ['500', '600', '700'], () => 'archivo'),
  /** The cover generator ships static Archivo cuts (latin only); the variable latin-ext file adds ₹. */
  archivoCover: [
    ...['400', '500', '600', '700', '800'].map((w) => ({ family: 'Archivo Cover', weight: w, file: `archivo-cover-${w}.woff2`, range: LATIN })),
    ...['400', '500', '600', '700', '800'].map((w) => ({ family: 'Archivo Cover', weight: w, file: 'archivo-latin-ext.woff2', range: LATIN_EXT })),
  ],
} satisfies Record<string, Face[]>;

export function fontFaces(faces: Face[], base = assetBase()): string {
  const seen = new Set<string>();
  return faces
    .filter((f) => {
      const key = `${f.family}|${f.weight}|${f.file}`;
      return !seen.has(key) && !!seen.add(key);
    })
    .map((f) => `@font-face { font-family: '${f.family}'; font-style: normal; font-weight: ${f.weight}; font-display: block; src: url("${base}fonts/${f.file}") format('woff2');${f.range ? ` unicode-range: ${f.range};` : ''} }`)
    .join('\n');
}

/** en-IN grouping with fixed decimals, "—" when not a number: the tools' fmt(). */
export const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

/** One sheet's fonts, CSS, pages and script, to print alone or inside the whole DPR. */
export interface SheetPart {
  fonts: Face[];
  css: string;
  pages: SheetPage[];
  script?: string;
}

export interface SheetPage {
  /** Page size in CSS units, e.g. ['297mm', '210mm']. */
  size: [string, string];
  /** Inner HTML of the page box. */
  html: string;
  /** Padding of the page box (the tools' print margins). */
  padding?: string;
  className?: string;
}

/** A flowing part of a document (e.g. the DPR's text pages); its CSS sets its own @page rule. */
export interface FlowPart {
  flow: string;
}
const isFlow = (p: SheetPage | FlowPart): p is FlowPart => 'flow' in p;
const pageName = (size: [string, string]) => `p-${size.join('-').replace(/[^a-z0-9]+/gi, '-')}`;

/**
 * A printable document: one fixed-size box per page, shown on a grey desk on screen with a print button,
 * printed edge to edge (@page margin 0) so the browser's own margin setting doesn't move anything.
 * Pages of different sizes (and flowing parts) can follow one another: each size gets a named @page.
 */
export function sheetDocument(o: { title: string; fonts: string; css: string; pages: (SheetPage | FlowPart)[]; script?: string; orientation?: 'portrait' | 'landscape'; note?: string }): string {
  const fixed = o.pages.filter((p): p is SheetPage => !isFlow(p));
  const [w, h] = fixed[0]?.size ?? ['210mm', '297mm'];
  const sizes = [...new Map(fixed.map((p) => [pageName(p.size), p.size])).entries()];
  const note = o.note ?? `A4 ${o.orientation ?? 'portrait'}. In the print dialog pick “Save as PDF”; leave scale at 100%.`;
  const last = o.pages.length - 1;
  const part = (p: SheetPage | FlowPart, i: number) =>
    isFlow(p)
      ? p.flow
      : `<div class="sheet-page${p.className ? ` ${p.className}` : ''}${i === last ? ' last' : ''}" style="page:${pageName(p.size)};width:${p.size[0]};height:${p.size[1]};${p.padding ? `padding:${p.padding};` : ''}">${p.html}</div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<style>
${o.fonts}
@page { size: ${w} ${h}; margin: 0; }
${sizes.map(([name, [sw, sh]]) => `@page ${name} { size: ${sw} ${sh}; margin: 0; }`).join('\n')}
html, body { margin: 0; padding: 0; }
*, ::before, ::after { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { background: #e7e5e4; }
.sheet-page { position: relative; box-sizing: border-box; overflow: hidden; background: #fff; margin: 0 auto 24px; box-shadow: 0 2px 14px rgba(20,20,19,.18); }
.sheet-bar { position: sticky; top: 0; z-index: 100; display: flex; align-items: center; gap: 14px; justify-content: center; padding: 10px 16px; margin-bottom: 24px; background: #1f2937; color: #e5e7eb; font: 13px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; }
.sheet-bar button { font: 600 13px system-ui, -apple-system, 'Segoe UI', sans-serif; color: #111827; background: #fff; border: 0; border-radius: 4px; padding: 7px 14px; cursor: pointer; }
.sheet-bar span { color: #9ca3af; }
@media print {
  body { background: #fff; }
  .sheet-bar { display: none !important; }
  .sheet-page { margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
  .sheet-page.last { break-after: auto; page-break-after: auto; }
}
${o.css}
</style>
</head>
<body>
<div class="sheet-bar"><button type="button" onclick="window.print()">Print / Save as PDF</button><span>${esc(note)}</span></div>
${o.pages.map(part).join('\n')}
${o.script ? `<script>${o.script}</script>` : ''}
</body>
</html>`;
}

/** Opens a sheet in a new tab, from where it is printed or saved as PDF. */
export function openSheet(html: string): boolean {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return !!w;
}
