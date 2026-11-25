import type { BcrAppraisal, BcrInputs } from '@/features/preparation/finance';
import { assetBase, esc, fmt as F, FONTS, fontFaces, sheetDocument, type SheetPart } from './shared';

export interface BcrSheetData {
  /** Work description printed under the heading. */
  title: string;
  /** Project cost, Rs lakh (year 0 outflow). */
  cost: number;
  inputs: BcrInputs;
  appraisal: BcrAppraisal;
}

// Print rules of the KPTCL BCR calculator (12-09-2026). The page box now carries the 0.25 in margin the
// Thyavanige PDF was printed with, so the browser's own margin setting no longer matters.
const CSS = `
.bcr-page { font-family: "IBM Plex Sans", system-ui, sans-serif; color: #17191b; }
.bcr-page * { box-sizing: border-box; }
.bcr-page input { font-family: inherit; }
.bcr-p1 { zoom: 0.71; }
.bcr-p2 { zoom: 0.69; }
.bcr-p2 th, .bcr-p2 td { padding: 4px 9px !important; }
`;

/** Number as the calculator's input box shows it: as typed, no grouping. */
const typed = (n: number) => String(Math.round(n * 10000) / 10000);

export function bcrPagesHtml(d: BcrSheetData, logo: string): [string, string] {
  const { appraisal: a, inputs: i, cost } = d;
  const N = a.schedule.length;
  const cum = [-cost, ...a.schedule.map((y) => y.cumulative)];
  const r = i.discountRatePct / 100;
  const npvCap = -a.npvCapital;

  const fields: [string, string, string, string][] = [
    ['Additional load after enhancement', 'Net additional MVA on the station.', typed(i.addedMva), 'MVA'],
    ['DPR / project cost', 'From cost estimates and fees, inclusive of GST.', typed(cost), 'Lakhs'],
    ['Energy savings', 'Applicable for new stations where savings are derived.', typed(i.energySavingsMu), 'MU'],
    ['Sale price of energy', 'ESCOM sale price, fixed each financial year.', typed(i.salePrice), 'Rs./Unit'],
    ['Transmission charges', 'KPTCL charges, fixed each financial year.', typed(i.transmissionCharge), 'Rs./Unit'],
    ['Load growth', 'Whole number 1–25, per local growth trend.', typed(i.loadGrowthPct), '%'],
    ['Discount rate', 'Typically 9–12% depending on financing.', typed(i.discountRatePct), '%'],
    ['O & M cost', 'Normally 1% of total project cost, per annum.', typed(i.omPct), '%'],
  ];
  const kpis = [
    { label: 'Benefit–Cost Ratio', value: F(a.bcr), sub: a.bcr >= 1 ? 'Viable (≥ 1.00)' : 'Below threshold', accent: '#1f2a6b', tint: '#f2f4fc' },
    { label: 'Payback period', value: a.payback === null ? '—' : String(a.payback), sub: a.payback === null ? 'Not recovered in horizon' : 'Years (discounted)', accent: '#0d635c', tint: '#eff7f5' },
    { label: 'IRR', value: a.irr === null ? '—' : `${F(a.irr * 100, 0)}%`, sub: `vs. ${F(r * 100, 0)}% discount rate`, accent: '#96500f', tint: '#fcf4e9' },
  ];
  const summary = [
    { label: 'NPV of benefits', value: `${F(a.npvBenefits)} L`, bg: 'transparent', color: '#17191b' },
    { label: 'NPV of capital outflow', value: `${F(npvCap)} L`, bg: 'transparent', color: '#17191b' },
    { label: 'Minimum capital requirement (MCR)', value: `${F(a.mcr)} L`, bg: 'transparent', color: '#17191b' },
    { label: 'B/C — NPV ÷ MCR + 1 (method 1)', value: F(a.bcrMethod1), bg: '#f2f4fc', color: '#1f2a6b' },
    { label: 'B/C — NPV benefits ÷ NPV capital (method 2)', value: F(a.bcr), bg: '#f2f4fc', color: '#1f2a6b' },
    { label: 'Total undiscounted income', value: `${F(a.totalIncome, 0)} L`, bg: 'transparent', color: '#0d635c' },
  ];

  // ---- chart geometry, as the calculator draws it ----
  const W = 620;
  const H = 240;
  const pad = 6;
  const lo = Math.min(0, ...cum);
  const hi = Math.max(0, ...cum);
  const span = hi - lo || 1;
  const X = (k: number) => (k / (cum.length - 1)) * W;
  const Y = (v: number) => pad + (1 - (v - lo) / span) * (H - pad * 2);
  const pts = cum.map((v, k) => `${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const niceStep = (raw: number) => {
    const mag = 10 ** Math.floor(Math.log10(Math.abs(raw) || 1));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 5 ? 5 : n <= 7.5 ? 7.5 : 10) * mag;
  };
  const step = niceStep(span / 5);
  const tick = (v: number, label?: string, bold = false) => ({ label: label ?? F(v, 0), bold: bold ? '600' : '400', color: bold ? '#1f2a6b' : '#000', y: Y(v).toFixed(1), top: `${((Y(v) / H) * 100).toFixed(2)}%` });
  const troughV = Math.min(...cum);
  const peakV = Math.max(...cum);
  const yTicks = [tick(troughV, F(troughV, 2), true), tick(peakV, F(peakV, 2), true)];
  const keepAway = span * 0.07;
  for (let raw = Math.floor(lo / step) * step; raw <= hi + 1e-9; raw += step) {
    const v = raw === 0 ? 0 : raw;
    if (v < lo - 1e-9 || v > hi + 1e-9) continue;
    if (Math.abs(v - troughV) < keepAway || Math.abs(v - peakV) < keepAway) continue;
    yTicks.push(tick(v));
  }
  const xStep = N > 24 ? 5 : N > 12 ? 4 : 2;
  const xTicks: { label: string; x: string; left: string }[] = [];
  for (let t = 0; t <= N; t += xStep) xTicks.push({ label: String(t), x: X(t).toFixed(1), left: `${((X(t) / W) * 100).toFixed(2)}%` });
  const exact = a.breakEven ?? 0;
  const payX = (exact ? X(exact) : 0).toFixed(1);
  const zeroY = Y(0).toFixed(1);

  // ---- schedule ----
  const cols = ['Year', 'Energy chg', 'Trans. chg', 'Savings', 'Addl. sale', 'Addl. savings', 'Income', 'Cash flow', 'Disc. factor', 'Discounted CF', 'Cumulative DCF'];
  const neg = 'oklch(0.5 0.14 28)';
  const blk = '#000000';
  const rows = [
    { bg: '#f2f4fc', cells: [{ v: '0', c: blk }, ...Array.from({ length: 6 }, () => ({ v: '—', c: blk })), { v: F(-cost), c: neg }, { v: F(1, 4), c: blk }, { v: F(-cost), c: neg }, { v: F(-cost), c: neg }] },
    ...a.schedule.map((y, k) => ({
      bg: (k + 1) % 2 === 0 ? '#fafaf7' : '#ffffff',
      cells: [
        { v: String(y.year), c: blk },
        { v: F(y.energyCharge), c: blk },
        { v: F(y.transmissionCharge, 3), c: blk },
        { v: F(y.savings), c: blk },
        { v: F(y.additionalSaleMu, 3), c: blk },
        { v: F(y.additionalSavings), c: blk },
        { v: F(y.income), c: blk },
        { v: F(y.cashFlow), c: blk },
        { v: F(y.discountFactor, 4), c: blk },
        { v: F(y.discountedCashFlow), c: blk },
        { v: F(y.cumulative), c: y.cumulative < 0 ? neg : 'oklch(0.45 0.11 155)' },
      ],
    })),
  ];

  const page1 = `
<div class="bcr-p1">
  <div style="background:#fff;border:1px solid #dedad2;border-radius:4px;margin-bottom:24px">
    <div style="display:grid;grid-template-columns:auto 1fr auto;gap:20px;align-items:center;padding:16px 22px;border-bottom:1px solid #e6e2da;width:100%;max-width:100%">
      <div style="display:flex;align-items:center;gap:18px;min-width:0">
        <img src="${esc(logo)}" alt="KPTCL" style="width: 73px; height: 66px; object-fit: contain; flex: none; mix-blend-mode: multiply">
        <div style="width:1px;align-self:stretch;background:#d5d8e4;flex:none"></div>
        <div style="min-width:0">
          <div style="font-size:17px;font-weight:700;line-height:1.22;color:#1f2a6b;letter-spacing:0.005em">KARNATAKA POWER TRANSMISSION<br>CORPORATION LIMITED</div>
          <div style="font-size:9.5px;font-weight:500;letter-spacing:0.2em;color:#8189a8;margin-top:7px">A GOVERNMENT OF KARNATAKA UNDERTAKING</div>
        </div>
      </div>
      <div style="text-align:right;font-family:'Archivo','IBM Plex Sans',sans-serif;font-size:24px;font-weight:600;letter-spacing:0.28em;color:#1f2a6b;text-transform:uppercase">BCR Analysis</div>
      <div></div>
    </div>
    <div style="padding:20px 22px 18px;width:100%;max-width:100%">
      <div style="width:100%;min-height:calc(3 * 1.42em + 11.5px);display:block;text-align:center;font-family:'Archivo','IBM Plex Sans',sans-serif;font-size:19px;font-weight:600;line-height:1.42;color:#17191b;border:1px solid transparent;border-radius:3px;padding:4px 8px;white-space:pre-wrap">${esc(d.title)}</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:22px;align-items:stretch">
    <div style="background:#fff;border:1px solid #e2e2dd;border-radius:4px;padding:20px;display:flex;flex-direction:column">
      <div style="font-family: 'IBM Plex Mono',monospace; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: #1f2a6b; padding-bottom: 12px; border-bottom: 1px solid #ececE7; margin-bottom: 4px"><b>Input parameters</b></div>
      ${fields
        .map(
          ([label, note, value, unit]) => `
      <div style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:11px 0;border-bottom:1px solid #f0f0eb">
        <div style="min-width:0">
          <div style="font-size:14.5px;font-weight:500;line-height:1.35">${esc(label)}</div>
          <div style="font-size:12.5px;color:#000;line-height:1.45;margin-top:3px">${esc(note)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;justify-self:end">
          <input type="text" readonly value="${esc(value)}" style="width:${Math.max(76, value.length * 9 + 18)}px;text-align:right;font-family:'IBM Plex Mono',monospace;font-size:15px;padding:7px 8px;border:1px solid #d3d3ce;border-radius:2px;background:#fdfdfb;color:#17191b">
          <span style="font-family: 'IBM Plex Mono',monospace; font-size: 11px; color: #000; min-width: 44px; width: auto; white-space: nowrap">${esc(unit)}</span>
        </div>
      </div>`,
        )
        .join('')}
      <div style="font-size:12.5px;color:#000;line-height:1.5;padding-top:12px;margin-top:auto">Escalation on energy and transmission charges is applied at ${F(i.escalationPct, 0)}% per annum over a ${N}-year horizon.</div>
    </div>

    <div style="display:flex;flex-direction:column;gap:18px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
        ${kpis
          .map(
            (k) => `
        <div style="background:${k.tint};border:1px solid #e2e2dd;border-top:3px solid ${k.accent};border-radius:3px;padding:14px 15px">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:0.12em;text-transform:uppercase;color:${k.accent};line-height:1.4;min-height:26px">${esc(k.label)}</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:27px;font-weight:600;letter-spacing:-0.02em;margin-top:4px;color:${k.accent}">${esc(k.value)}</div>
          <div style="font-size:12.5px;color:#000;margin-top:3px">${esc(k.sub)}</div>
        </div>`,
          )
          .join('')}
      </div>

      <div style="background:#fff;border:1px solid #e2e2dd;border-radius:4px;padding:18px 18px 12px;width:100%;max-width:100%;flex:1 1 auto;display:flex;flex-direction:column;min-height:293px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#1f2a6b"><b>Cumulative discounted cash flow</b></div>
        </div>
        <div style="display:grid;grid-template-columns:auto 1fr;grid-template-rows:1fr auto;gap:0 8px;flex:1 1 auto;min-height:0">
          <div style="display:flex;align-items:stretch;gap:6px;min-height:180px">
            <div style="writing-mode:vertical-rl;transform:rotate(180deg);display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:0.12em;text-transform:uppercase;color:#1f2a6b;white-space:nowrap"><b><span style="letter-spacing: 0.12em;">LAKHS</span></b></div>
            <div style="position: relative; width: 60px; min-height: 180px">
              ${yTicks.map((t) => `<div style="position:absolute;right:0;top:${t.top};transform:translateY(-50%);font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-weight:${t.bold};color:${t.color};text-align:right;white-space:nowrap">${esc(t.label)}</div>`).join('')}
            </div>
          </div>
          <div style="position:relative;border-left:1px solid #b9bcc0;border-bottom:1px solid #b9bcc0;min-height:180px">
            <svg viewBox="0 0 620 240" preserveAspectRatio="none" style="width:100%;height:100%;min-height:180px;display:block">
              ${yTicks.map((t) => `<line x1="0" y1="${t.y}" x2="620" y2="${t.y}" stroke="#f0f0eb" stroke-width="1"></line>`).join('')}
              ${xTicks.map((t) => `<line x1="${t.x}" y1="0" x2="${t.x}" y2="240" stroke="#f6f6f2" stroke-width="1"></line>`).join('')}
              <line x1="0" y1="${zeroY}" x2="620" y2="${zeroY}" stroke="#a9adb2" stroke-width="1"></line>
              ${exact ? `<line x1="${payX}" y1="0" x2="${payX}" y2="240" stroke="oklch(0.55 0.13 45)" stroke-width="1" stroke-dasharray="4 4"></line>` : ''}
              <polygon points="0,${zeroY} ${pts} ${W},${zeroY}" fill="oklch(0.52 0.12 248 / 0.10)"></polygon>
              <polyline points="${pts}" fill="none" stroke="oklch(0.48 0.13 248)" stroke-width="2" stroke-linejoin="round"></polyline>
            </svg>
            ${exact ? `<div style="position:absolute;left:${((Number(payX) / W) * 100).toFixed(2)}%;top:${((Number(zeroY) / H) * 100).toFixed(2)}%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:oklch(0.55 0.13 45)"></div>` : ''}
          </div>
          <div></div>
          <div style="position:relative;height:16px">
            ${xTicks.map((t) => `<div style="position:absolute;top:4px;left:${t.left};transform:translateX(-50%);font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:#000">${t.label}</div>`).join('')}
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;font-family:'IBM Plex Mono',monospace;font-size:11px;color:#000;margin-top:8px;padding-left:64px">
          <span style="letter-spacing: 0.12em; text-transform: uppercase; font-size: 9.5px; color: #1f2a6b; width: 176px; height: 11px; text-align: center">YEAR</span><span style="color:oklch(0.5 0.13 45)">Break-even ≈ Yr ${exact ? F(exact, 1) : '—'}</span>
        </div>
      </div>

      <div style="background:#fff;border:1px solid #e2e2dd;border-radius:4px;padding:18px;width:100%;max-width:100%;flex:0 0 auto">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#1f2a6b;margin-bottom:12px">Appraisal summary</div>
        ${summary
          .map(
            (s) => `
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:8px 10px;border-bottom:1px solid #f0f0eb;background:${s.bg};border-radius:2px">
          <span style="font-size:14.5px;color:#000">${esc(s.label)}</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:15px;font-weight:500;white-space:nowrap;color:${s.color}">${esc(s.value)}</span>
        </div>`,
          )
          .join('')}
      </div>
    </div>
  </div>
</div>`;

  const page2 = `
<div class="bcr-p2">
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
    <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#1f2a6b">Year-wise schedule · all figures in Lakhs unless noted</div>
  </div>
  <div style="background:#fff;border:1px solid #e2e2dd;border-radius:4px">
    <table style="width:100%;border-collapse:collapse;font-family:'IBM Plex Mono',monospace;font-size:12.5px;white-space:nowrap">
      <thead><tr>${cols.map((c) => `<th style="text-align:right;font-weight:600;color:#eef0f9;font-size:10.5px;letter-spacing:0.08em;text-transform:uppercase;padding:11px 12px;background:#1f2a6b">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr style="border-bottom:1px solid #f2f2ed;background:${row.bg}">${row.cells.map((c) => `<td style="text-align:right;padding:7px 12px;color:${c.c}">${esc(c.v)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  </div>
</div>
<div style="margin-top:26px;font-size:12.5px;color:#000;line-height:1.6;max-width:760px">
  BCR = NPV of benefits ÷ NPV of capital outflow. Payback period is the first full year in which cumulative discounted cash flow turns positive. IRR is the discount rate at which NPV of the cash-flow stream equals zero. Method and escalation assumptions follow the KPTCL BCR workbook.
</div>`;
  return [page1, page2];
}

/** The BCR analysis's fonts, CSS and two pages. */
export function bcrPart(d: BcrSheetData, base = assetBase()): SheetPart {
  const [p1, p2] = bcrPagesHtml(d, `${base}kptcl-logo-bcr.jpg`);
  const size: [string, string] = ['297mm', '210mm'];
  return {
    fonts: [...FONTS.plexMono, ...FONTS.plexSans, ...FONTS.archivo],
    css: CSS,
    pages: [
      { size, padding: '0.25in', className: 'bcr-page', html: p1 },
      { size, padding: '0.25in', className: 'bcr-page', html: p2 },
    ],
  };
}

/** The BCR analysis as two printable A4-landscape pages, as the KPTCL BCR calculator prints it. */
export function bcrSheetHtml(d: BcrSheetData, title = 'BCR analysis'): string {
  const base = assetBase();
  const p = bcrPart(d, base);
  return sheetDocument({ title, orientation: 'landscape', fonts: fontFaces(p.fonts, base), css: p.css, pages: p.pages });
}
