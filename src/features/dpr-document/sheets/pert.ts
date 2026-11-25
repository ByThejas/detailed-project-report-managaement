import type { PertPlan } from '../pert';
import { assetBase, esc, FONTS, fontFaces, sheetDocument, type SheetPart } from './shared';

export interface PertSheetData {
  plan: PertPlan;
  /** Work description printed as the heading. */
  title: string;
  /** "66/11 kV". */
  voltage: string;
}

// Colours and layout rules of the KPTCL PERT chart generator (12-09-2026).
const HUES = [276, 205, 48, 320, 160, 25];
const ink = (i: number) => `oklch(0.40 0.10 ${HUES[i % HUES.length]})`;
const tint = (i: number) => `oklch(0.965 0.018 ${HUES[i % HUES.length]})`;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const NAVY = 'oklch(0.33 0.12 276)';

const FIT = `
(function () {
  function fit() {
    var el = document.getElementById('pert-wrap');
    if (!el) return;
    el.style.transform = 'scale(1)'; el.style.width = '100%';
    var natural = el.scrollHeight;
    if (!natural) return;
    var k = Math.min(1, 744 / natural);
    el.style.transform = 'scale(' + k + ')';
    el.style.width = (100 / k) + '%';
  }
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();
`;

/** The page body, built the way the generator's template renders it. */
export function pertPageHtml({ plan, title, voltage }: PertSheetData, logo: string): string {
  const pre = plan.activities.filter((a) => a.preAward);
  const work = plan.activities.filter((a) => !a.preAward);
  const showPre = pre.length > 0;
  // ---- the generator's fit of the sheet to the A4-landscape box (794 px tall) ----
  const nStages = Math.max(1, work.length);
  const tasksOf = (details: string[]) => details.filter((t) => String(t).trim());
  const maxTasks = work.reduce((a, s) => Math.max(a, tasksOf(s.details).length), 0);
  const titleLines = Math.max(1, Math.ceil(title.length / 74));
  const titleH = titleLines * 25 + 22;
  const detailH = 38 + maxTasks * 24;
  const childCount = 5 + 1;
  const pageGap = 9;
  const msH = 58;
  const gridRows = 1 + (showPre ? 2 : 0) + nStages + 1;
  const gridOther = 36 + (showPre ? 52 : 0) + msH + 7 * (gridRows - 1);
  const fixed = 71 + titleH + 47 + detailH + 50 + pageGap * (childCount - 1);
  const avail = 794 - 28 - 22 - 14 - fixed - gridOther;
  const stageH = Math.max(38, Math.min(88, Math.floor(avail / nStages)));

  // Stages sit where the plan puts them; the chart runs to the completion period or the last stage, whichever is later.
  const N = Math.max(1, plan.completionMonths, ...work.map((a) => a.start + a.months));
  const pct = (m: number) => (showPre ? `calc(82px + (100% - 82px) * ${m / N})` : `${(m / N) * 100}%`);
  const preOff = showPre ? 1 : 0;
  const stages = work.map((s, i) => {
    const dur = Math.max(1, s.months);
    const end = s.start + dur;
    const wide = dur / N >= 0.3;
    return {
      n: ROMAN[i] ?? String(i + 1),
      label: s.label ?? s.name,
      dur: dur === 1 ? '1 MONTH' : `${dur} MONTHS`,
      tasks: tasksOf(s.details),
      ink: ink(i),
      tint: tint(i),
      titleDisplay: wide ? 'block' : 'none',
      chipPush: wide ? '0' : 'auto',
      outsideDisplay: wide ? 'none' : 'block',
      outLeft: end >= N ? 'auto' : '100%',
      outRight: end >= N ? '100%' : 'auto',
      col: `${Math.max(0, s.start) + 1 + preOff} / span ${dur}`,
      end,
      done: s.milestone?.trim() ?? '',
    };
  });
  const msList = [{ m: 0, label: `${plan.zeroDate || 'LOI / Award'} — zero date` }, ...stages.map((s) => ({ m: s.end, label: s.done }))].filter((m) => m.label);
  const cols = `${showPre ? '82px ' : ''}repeat(${N}, 1fr)`;
  const bg = showPre ? `calc((100% - 82px) / ${N}) 100%` : `calc(100% / ${N}) 100%`;
  const bgPos = showPre ? '82px 0' : '0 0';
  const total = N;
  const totalLabel = `${total} ${total === 1 ? 'month' : 'months'}`;
  const monthCells = [
    ...(showPre ? [{ n: 0, fill: '#eef1f6', tint: '#4a5270', divider: 'transparent' }] : []),
    ...Array.from({ length: N }, (_, i) => ({
      n: i + 1,
      fill: i % 2 === 0 ? NAVY : 'oklch(0.38 0.11 276)',
      tint: '#e6e9f6',
      divider: i === 0 ? (showPre ? NAVY : 'transparent') : 'rgba(255,255,255,0.28)',
    })),
  ];
  const preRows = showPre ? pre.slice(0, 2).map((a, i) => ({ label: a.name, note: i === 0 ? 'Pre-award' : '', col: '1 / span 1' })) : [];
  const milestones = msList.map((m, i) => ({
    ...m,
    push: i % 2 === 1 ? '14px' : '0',
    left: pct(m.m),
    tx: m.m === 0 ? 'translateX(42px)' : m.m === N ? 'translateX(-42px)' : 'none',
  }));

  const card = (label: string, value: string, top: string) => `
    <div style="border:1px solid #dfe6eb; border-top:2px solid ${top}; padding:7px 10px">
      <div style="font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:0.1em; color:#000; text-transform:uppercase">${esc(label)}</div>
      <div style="font-size:13px; font-weight:600; margin-top:2px">${esc(value)}</div>
    </div>`;
  const gridBg = `background-image:linear-gradient(to right, #aebac6 1.5px, transparent 1.5px); background-size:${bg}; background-position:${bgPos}`;

  return `
<div id="pert-wrap" style="display:flex; flex-direction:column; gap:${pageGap}px; min-height:744px; width:100%; transform:scale(1); transform-origin:top left">

  <div style="display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:16px; border-bottom:2px solid ${NAVY}; padding-bottom:8px">
    <div style="display:flex; align-items:center; gap:14px">
      <img src="${esc(logo)}" alt="KPTCL" style="width: 84px; height: 56px; object-fit: contain; flex: none">
      <div style="display:flex; flex-direction:column; gap:5px">
        <div style="font-size:15px; line-height:1.15; font-weight:700; letter-spacing:0.005em; color:${NAVY}; text-transform:uppercase">Karnataka Power Transmission<br>Corporation Limited</div>
        <div style="font-family:'IBM Plex Sans',sans-serif; font-size:8px; line-height:1; letter-spacing:0.2em; text-transform:uppercase; color:#000">A Government of Karnataka Undertaking</div>
      </div>
    </div>
    <div></div>
    <div style="font-family:'IBM Plex Mono',monospace; font-size:30px; font-weight:600; letter-spacing:0.2em; color:${NAVY}; white-space:nowrap; text-align:right; justify-self:end">PERT CHART</div>
  </div>

  <div style="display:flex; flex-direction:column; gap:5px; align-items:center">
    <div style="display:flex; align-items:center; gap:10px; justify-content:center">
      <h1 style="margin:0; font-family:'IBM Plex Serif',serif; font-size:20px; font-weight:600; line-height:1.2; letter-spacing:-0.005em; text-align:center; text-wrap:balance">${esc(title)}</h1>
      ${plan.provisional ? `<span style="flex:none; font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.48 0.11 48); border:1px solid oklch(0.48 0.11 48); padding:3px 7px; white-space:nowrap">Provisional</span>` : ''}
    </div>
    <div style="width:78px; height:2px; background:oklch(0.48 0.11 48); margin-top:7px"></div>
  </div>

  <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px">
    ${card('Voltage class', voltage, NAVY)}
    ${card('Scope', plan.scope, NAVY)}
    ${card('Completion period', totalLabel, NAVY)}
    ${card('Zero date', plan.zeroDate || 'LOI / Award', 'oklch(0.48 0.11 48)')}
  </div>

  <div style="display:grid; grid-template-columns:104px 1fr; column-gap:0; row-gap:7px; align-items:stretch">

    <div style="display:flex; flex-direction:column; align-items:flex-end; justify-content:center; gap:2px; padding:0 10px 0 0; text-align:right">
      <div style="font-family: 'IBM Plex Mono',monospace; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #000">Timeline</div>
    </div>
    <div style="display:flex; flex-direction:column">
      <div style="display:grid; grid-template-columns:${cols}; height:19px; border:1px solid ${NAVY}; border-bottom:none; overflow:hidden">
        ${monthCells.map((c) => `<div style="display: flex; align-items: center; justify-content: center; border-left: 1px solid ${c.divider}; background: ${c.fill}; font-family: 'IBM Plex Mono',monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.1em; color: ${c.tint}">M${c.n}</div>`).join('')}
      </div>
    </div>

    ${preRows
      .map(
        (r) => `
    <div style="display: flex; align-items: center; justify-content: flex-end; padding: 0 10px 0 0; font-family: 'IBM Plex Mono',monospace; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #000; border-right: 1.5px solid #cdd7de">${esc(r.note)}</div>
    <div style="height:26px; display:grid; grid-template-columns:${cols}; ${gridBg}">
      <div style="grid-column:${r.col}; margin:3px 2px; position:relative; background-color:#eef1f6; background-image:repeating-linear-gradient(135deg, rgba(60,66,110,0.12) 0 3px, transparent 3px 7px); border:1px solid #c6cbdd">
        <div style="position:absolute; left:100%; top:50%; transform:translateY(-50%); margin-left:9px; white-space:nowrap; font-size:10.5px; font-weight:600; line-height:1.2; color:#000">${esc(r.label)}</div>
      </div>
    </div>`,
      )
      .join('')}

    ${stages
      .map(
        (s) => `
    <div style="display:flex; align-items:center; justify-content:flex-end; padding:0 10px 0 0; border-right:1.5px solid #cdd7de">
      <div style="font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:0.12em; color:${s.ink}; font-weight:600; white-space:nowrap">STAGE-${s.n}</div>
    </div>
    <div style="height:${stageH}px; display:grid; grid-template-columns:${cols}; ${gridBg}">
      <div style="grid-column:${s.col}; margin:3px 2px; position:relative; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:0 10px; background:${s.tint}; border:1px solid ${s.ink}; border-left:4px solid ${s.ink}">
        <div style="font-size:11.5px; font-weight:600; line-height:1.25; color:${s.ink}; text-wrap:pretty; display:${s.titleDisplay}">${esc(s.label)}</div>
        <div style="flex:none; font-family:'IBM Plex Mono',monospace; font-size:10px; font-weight:600; letter-spacing:0.06em; color:#fff; background:${s.ink}; padding:2px 6px; white-space:nowrap; margin-left:${s.chipPush}">${s.dur}</div>
        <div style="position:absolute; left:${s.outLeft}; right:${s.outRight}; top:50%; transform:translateY(-50%); margin:0 9px; white-space:nowrap; font-size:11.5px; font-weight:600; line-height:1.25; color:${s.ink}; display:${s.outsideDisplay}">${esc(s.label)}</div>
      </div>
    </div>`,
      )
      .join('')}

    ${
      milestones.length
        ? `
    <div style="display: flex; align-items: flex-start; justify-content: flex-end; padding: 8px 10px 0 0; font-family: 'IBM Plex Mono',monospace; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #000; text-align: right"><b>Milestones</b></div>
    <div style="position:relative; height:${msH}px; border-top:1px solid #cdd7de">
      ${milestones
        .map(
          (m) => `
      <div style="position:absolute; left:${m.left}; top:0; width:0; display:flex; flex-direction:column; align-items:center; gap:3px">
        <div style="width:8px; height:8px; background:oklch(0.52 0.12 48); transform:rotate(45deg); margin-top:-4px"></div>
        <div style="font-family: 'IBM Plex Mono',monospace; font-size: 11px; font-weight: 600; color: oklch(0.46 0.12 48); white-space: nowrap">M${m.m}</div>
        <div style="width: 104px; margin-top: ${m.push}; font-size: 10px; line-height: 1.2; text-align: center; color: #000; text-wrap: pretty; transform: ${m.tx}">${esc(m.label)}</div>
      </div>`,
        )
        .join('')}
    </div>`
        : ''
    }
  </div>

  <div style="display:grid; grid-template-columns:104px 1fr; column-gap:0">
    <div style="display: flex; align-items: flex-start; justify-content: flex-end; padding: 9px 10px 0 0; font-family: 'IBM Plex Mono',monospace; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #000; text-align: right; border-right: 1.5px solid #cdd7de"><b>Stage detail</b></div>
    <div style="display:grid; grid-template-columns:repeat(${Math.max(1, stages.length)},1fr); gap:0; border-top:1px solid #cdd7de">
      ${stages
        .map(
          (s) => `
      <div style="padding:8px 12px; border-left:3px solid ${s.ink}; display:flex; flex-direction:column; gap:4px">
        <div style="font-family: 'IBM Plex Mono',monospace; font-size: 11.5px; letter-spacing: 0.1em; font-weight: 600; color: ${s.ink}">STAGE-${s.n} · ${s.dur}</div>
        <div style="flex:none; display:flex; flex-direction:column; gap:3px">
          ${s.tasks.map((t) => `<div style="flex:none; display:flex; align-items:flex-start; gap:7px; font-size:12.5px; color:#000; line-height:1.35"><div style="flex:none; width:5px; height:5px; background:${s.ink}; margin-top:5px"></div>${esc(t)}</div>`).join('')}
        </div>
      </div>`,
        )
        .join('')}
    </div>
  </div>

  <div style="display:flex; gap:16px; align-items:stretch; margin-top:auto"></div>
</div>`;
}

/** The PERT chart's fonts, CSS, page and fitting script. */
export function pertPart(d: PertSheetData, base = assetBase()): SheetPart {
  return {
    fonts: [...FONTS.plexMono, ...FONTS.plexSans, ...FONTS.plexSerif],
    css: `.pert-page { display:flex; flex-direction:column; gap:9px; font-family:'IBM Plex Sans',system-ui,sans-serif; color:#12283a; background:#fff; } .pert-page h1 { margin:0 }`,
    pages: [{ size: ['297mm', '210mm'], padding: '28px 34px 22px', className: 'pert-page', html: pertPageHtml(d, `${base}kptcl-logo-pert.jpg`) }],
    script: FIT,
  };
}

/** The PERT chart as a printable A4-landscape page, as the KPTCL PERT chart generator draws it. */
export function pertSheetHtml(d: PertSheetData, title = 'PERT chart'): string {
  const base = assetBase();
  const p = pertPart(d, base);
  return sheetDocument({ title, orientation: 'landscape', fonts: fontFaces(p.fonts, base), css: p.css, pages: p.pages, script: p.script });
}
