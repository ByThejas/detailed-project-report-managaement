import { assetBase, esc, FONTS, fontFaces, sheetDocument, type SheetPart } from './shared';

/** The cover's facts, in the shape of the KPTCL cover generator's queue items. */
export interface CoverData {
  kind: 'substation' | 'line';
  /** "BB1189, FY 2026-27". */
  code: string;
  /** Work title; the sheet upper-cases it. */
  title: string;
  /** "Channagiri Taluk, Davanagere District." */
  location: string;
  zone: string;
  /** "Brown Field". */
  site: string;
  /** "Additional Transformer + LILO". */
  work: string;
  /** Rs lakh, bare number ("1231.59") or already formatted. */
  cost: string;
  bcr?: string;
  irr?: string;
  payback?: string;
  conductor?: string;
  route?: string;
  preparedBy: string;
  preparedByRole?: string;
  /** Status label in the footer; empty by default (ADR-0022). */
  status?: string;
  /** Footer date, e.g. "October 2026". */
  date: string;
}

// Copied from cover_render.html (KPTCL cover generator); only the page box moved to .sheet-page.
const CSS = `
.a4-wrapper { font-family: 'Archivo Cover', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
.cv-border-outer { position: absolute; inset: 26px; border: 2.5px solid #12295c; }
.cv-border-inner { position: absolute; inset: 33px; border: 1px solid #12295c; }
.cv-bar-top { position: absolute; left: 0; top: 0; width: 100%; height: 10px; background: linear-gradient(90deg,#12295c 0 52%,#0e7c86 52% 80%,#c2760a 80% 100%); }
.cv-bar-bottom { position: absolute; left: 0; bottom: 0; width: 100%; height: 6px; background: linear-gradient(90deg,#c2760a 0 20%,#0e7c86 20% 48%,#12295c 48% 100%); }
.cv-corner { position: absolute; right: 26px; top: 26px; width: 0; height: 0; border-left: 56px solid transparent; border-top: 56px solid rgba(14,124,134,.12); }
.cv-body { position: absolute; inset: 33px; display: flex; flex-direction: column; padding: 44px 52px 40px; }
.cv-head { display: flex; align-items: center; gap: 22px; }
.cv-logo { width: 78px; height: 78px; flex: 0 0 78px; object-fit: contain; }
.cv-vrule { width: 1px; align-self: stretch; background: #c7ccd8; }
.cv-org-wrap { display: flex; flex-direction: column; gap: 5px; }
.cv-org { font-size: 19.5px; font-weight: 800; letter-spacing: .005em; line-height: 1.2; color: #12295c; text-transform: uppercase; }
.cv-undertaking { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase; color: #6b7280; }
.cv-rule { height: 2px; background: linear-gradient(90deg,#12295c,#0e7c86 60%,#c2760a); }
.cv-rule-top { margin: 26px 0 0; }
.cv-rule-bot { margin: 22px 0 0; }
.cv-banner-wrap { display: flex; justify-content: center; margin-top: 34px; }
.cv-banner { background: linear-gradient(100deg,#12295c 0%,#173a86 60%,#0e7c86 100%); color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: .26em; text-transform: uppercase; padding: 13px 44px; }
.cv-title-box { margin-top: 40px; max-height: 182px; overflow: hidden; }
.cv-title { text-align: center; font-size: 26px; font-weight: 700; line-height: 1.28; letter-spacing: -.005em; color: #12295c; text-transform: uppercase; text-wrap: balance; overflow-wrap: anywhere; }
.cv-loc { margin-top: 6px; text-align: center; font-size: 15.5px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; color: #5b6577; }
.cv-dashes { display: flex; justify-content: center; gap: 6px; margin: 12px 0 0; }
.cv-dashes span { width: 34px; height: 3px; }
.cv-metrics { margin-top: 34px; border: 1px solid #ccd2de; border-top: 3px solid #12295c; }
.cv-mrow-1 { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr) minmax(0,1fr); background: linear-gradient(90deg,#eef2fa,#eaf5f6); }
.cv-mrow-2 { display: grid; grid-template-columns: auto minmax(0,1fr) minmax(0,1fr) minmax(0,1fr); border-top: 1px solid #ccd2de; }
.cv-mrow-2.cols-3 { grid-template-columns: minmax(0,1fr) minmax(0,1fr) minmax(0,1fr); }
.cv-mrow-2 .cv-lbl { white-space: nowrap; }
.cv-cell { padding: 14px 18px; display: flex; flex-direction: column; gap: 6px; }
.cv-mrow-2 .cv-cell { padding: 16px 18px; }
.cv-cell.divide { border-right: 1px solid #ccd2de; }
.cv-lbl { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; font-weight: 500; letter-spacing: .13em; text-transform: uppercase; color: #4b5364; }
.cv-val { font-size: 15px; font-weight: 700; color: #12295c; line-height: 1.3; overflow-wrap: anywhere; }
.cv-val-big { font-size: 20px; font-weight: 800; color: #12295c; line-height: 1.2; overflow-wrap: anywhere; }
.fit-1 { height: 40px; overflow: hidden; }
.fit-2 { height: 24px; overflow: hidden; }
.cv-spacer { flex: 1; }
.cv-prep { display: flex; flex-direction: column; gap: 8px; border-left: 3px solid #0e7c86; padding-left: 14px; }
.cv-prep-lbl { font-family: 'IBM Plex Mono', monospace; font-size: 9px; letter-spacing: .16em; text-transform: uppercase; color: #0e7c86; }
.cv-prep-name { font-size: 14.5px; font-weight: 700; color: #12295c; line-height: 1.35; }
.cv-prep-role { font-weight: 500; color: #5b6577; }
.cv-foot { display: flex; justify-content: space-between; font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: #6b7280; padding-top: 12px; }
`;

// The generator's auto-fit: a long title or value steps its type down instead of being clipped.
const FIT = `
(function () {
  function fitEl(el, max, min, gauge) {
    var g = gauge || el, s = max;
    el.style.fontSize = s + 'px';
    while (g.scrollHeight > g.clientHeight + 1 && s > min) { s -= 0.5; el.style.fontSize = s + 'px'; }
  }
  function fitPage() {
    var page = document.querySelector('.a4-wrapper');
    if (!page) return;
    var box = page.querySelector('.cv-title-box');
    if (box) fitEl(box.querySelector('.cv-title'), 26, 13, box);
    page.querySelectorAll('[data-max]').forEach(function (el) { fitEl(el, parseFloat(el.dataset.max), 9); });
  }
  fitPage();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPage);
})();
`;

const isBare = (v?: string) => /^\d+(\.\d+)?$/.test(String(v ?? '').trim());
const fmtPct = (v?: string) => (!v ? '—' : isBare(v) ? `${v.trim()} %` : v);
const fmtYears = (v?: string) => (!v ? '—' : isBare(v) ? `${v.trim()} yrs` : v);
const fmtKm = (v?: string) => (!v ? '—' : isBare(v) ? `${v.trim()} km` : v);
function groupIN(n: string) {
  const [i = '', f] = n.split('.');
  const last3 = i.slice(-3);
  const rest = i.slice(0, -3);
  const g = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return f !== undefined ? `${g}.${f}` : g;
}
const fmtCost = (v?: string) => (!v ? '—' : isBare(v) ? `₹ ${groupIN(v.trim())}` : v);
const STATUS_COLOUR: Record<string, string> = { draft: '#c2760a', 'for internal review': '#c2760a', 'issued for approval': '#c2760a', approved: '#1f7a4d', final: '#1f7a4d', superseded: '#b3261e' };
const statusColour = (s?: string) => STATUS_COLOUR[String(s ?? '').toLowerCase()] ?? '#6b7280';
function natureText(d: CoverData) {
  const site = d.site.trim();
  const work = d.work.trim();
  if (site && work) return `${esc(site)} &mdash;<br>${esc(work)}`;
  return esc(site || work || '—');
}

function pageHtml(d: CoverData, logo: string) {
  const row2 =
    d.kind === 'line'
      ? `<div class="cv-mrow-2 cols-3">
          <div class="cv-cell divide"><div class="cv-lbl">Estimated cost (&#8377; lakh)</div><div class="cv-val-big fit-2" data-max="20">${esc(fmtCost(d.cost))}</div></div>
          <div class="cv-cell divide"><div class="cv-lbl" style="color:#0e7c86">Conductor</div><div class="cv-val-big fit-2" data-max="20" style="color:#0e7c86">${esc(d.conductor || '—')}</div></div>
          <div class="cv-cell"><div class="cv-lbl" style="color:#c2760a">Route length</div><div class="cv-val-big fit-2" data-max="20" style="color:#c2760a">${esc(fmtKm(d.route))}</div></div>
        </div>`
      : `<div class="cv-mrow-2">
          <div class="cv-cell divide"><div class="cv-lbl">Estimated cost (&#8377; lakh)</div><div class="cv-val-big fit-2" data-max="20">${esc(fmtCost(d.cost))}</div></div>
          <div class="cv-cell divide"><div class="cv-lbl" style="color:#1f7a4d">B/C ratio</div><div class="cv-val-big fit-2" data-max="20" style="color:#1f7a4d">${esc(d.bcr || '—')}</div></div>
          <div class="cv-cell divide"><div class="cv-lbl" style="color:#0e7c86">IRR</div><div class="cv-val-big fit-2" data-max="20" style="color:#0e7c86">${esc(fmtPct(d.irr))}</div></div>
          <div class="cv-cell"><div class="cv-lbl" style="color:#c2760a">Payback</div><div class="cv-val-big fit-2" data-max="20" style="color:#c2760a">${esc(fmtYears(d.payback))}</div></div>
        </div>`;
  return `
  <div class="cv-bar-top"></div>
  <div class="cv-border-outer"></div>
  <div class="cv-corner"></div>
  <div class="cv-border-inner"></div>
  <div class="cv-bar-bottom"></div>
  <div class="cv-body">
    <div class="cv-head">
      <img class="cv-logo" src="${esc(logo)}" alt="KPTCL">
      <div class="cv-vrule"></div>
      <div class="cv-org-wrap">
        <div class="cv-org">Karnataka Power Transmission<br>Corporation Limited</div>
        <div class="cv-undertaking">A Government of Karnataka Undertaking</div>
      </div>
    </div>
    <div class="cv-rule cv-rule-top"></div>
    <div class="cv-banner-wrap"><div class="cv-banner">Detailed Project Report</div></div>
    <div class="cv-title-box"><div class="cv-title">${esc(d.title)}</div></div>
    ${d.location ? `<div class="cv-loc">${esc(d.location)}</div>` : ''}
    <div class="cv-dashes"><span style="background:#12295c"></span><span style="background:#0e7c86"></span><span style="background:#c2760a"></span></div>
    <div class="cv-metrics">
      <div class="cv-mrow-1">
        <div class="cv-cell divide"><div class="cv-lbl">APW code</div><div class="cv-val fit-1" data-max="15">${esc(d.code)}</div></div>
        <div class="cv-cell divide"><div class="cv-lbl">Jurisdiction</div><div class="cv-val fit-1" data-max="15">${esc(d.zone)}</div></div>
        <div class="cv-cell"><div class="cv-lbl">Project nature</div><div class="cv-val fit-1" data-max="15">${natureText(d)}</div></div>
      </div>
      ${row2}
    </div>
    <div class="cv-spacer"></div>
    <div class="cv-prep">
      <div class="cv-prep-lbl">Prepared by</div>
      <div class="cv-prep-name">${esc(d.preparedBy)}${d.preparedByRole ? `<br><span class="cv-prep-role">${esc(d.preparedByRole)}</span>` : ''}</div>
    </div>
    <div class="cv-rule cv-rule-bot"></div>
    <div class="cv-foot">
      <div style="color:${statusColour(d.status)}; font-weight:500">${esc(d.status ?? '')}</div>
      <div>${esc(d.date)}</div>
    </div>
  </div>`;
}

/** The cover's fonts, CSS, page and fitting script, to print alone or as the first page of the DPR. */
export function coverPart(d: CoverData, base = assetBase()): SheetPart {
  return {
    fonts: [...FONTS.archivoCover, ...FONTS.plexMono.filter((f) => f.weight !== '600')],
    css: CSS,
    pages: [{ size: ['210mm', '297mm'], className: 'a4-wrapper', html: pageHtml(d, `${base}kptcl-logo-cover.png`) }],
    script: FIT,
  };
}

/** The DPR cover as a printable A4 page, as the KPTCL cover generator draws it. */
export function coverSheetHtml(d: CoverData, title = 'DPR cover'): string {
  const base = assetBase();
  const p = coverPart(d, base);
  return sheetDocument({ title, orientation: 'portrait', fonts: fontFaces(p.fonts, base), css: p.css, pages: p.pages, script: p.script });
}
