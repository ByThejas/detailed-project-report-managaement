import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { workbookToGrids } from '@/features/boq-import/readWorkbook';
import { parseBoq } from '@/features/boq-import/parse';
import { addFileHeadings, planImport } from '@/features/boq-import/toEstimateLine';
import type { Estimate } from '@/features/preparation/types';

const ROOT = process.env.BOQ_DIR ?? '';
const OUT = process.env.OUT ?? '/tmp/sl-eval.txt';
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const colIdx = (letter?: string) => { if (!letter) return 0; let n = 0; for (const ch of letter) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
const t = (s: string) => s.replace(/\s+/g, ' ').trim();

it.skipIf(!ROOT || !existsSync(ROOT))('serial numbers as in the file', async () => {
  const files = walk(ROOT).filter((f) => /\.xlsx$/i.test(f));
  const out: string[] = [];
  let n = 0, bad = 0, heads = 0, headsBad = 0, backN = 0, backBad = 0;
  for (const f of files) {
    const buf = readFileSync(f);
    const grids = await workbookToGrids(new Uint8Array(buf).buffer);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(new Uint8Array(buf).buffer);
    const read = parseBoq(grids, f.split('/').pop()!, 'electrical');
    const sheets = new Set(read.sheets.filter((s) => s.includedByDefault && s.headerRow).map((s) => s.name));
    const items = read.items.filter((i) => sheets.has(i.sheet) && !i.issues.some((x) => x.level === 'error'));
    const plan = planImport(read, items, sheets, true);
    plan.lines.forEach((l, k) => {
      const it = items[k]!;
      const sum = read.sheets.find((s) => s.name === it.sheet)!;
      const c = colIdx(sum.columns.code);
      if (!c) return;
      const ws = wb.getWorksheet(it.sheet)!;
      let shown = '';
      try { const cell = ws.getRow(it.row).getCell(c); shown = cell.isMerged && cell.master.address !== cell.address ? '' : t(cell.text ?? ''); } catch { shown = ''; }
      n++;
      if (shown !== l.code) { bad++; out.push(`code | ${f.replace(ROOT, '')} | ${it.sheet} r${it.row} | file "${shown}" app "${l.code}"`); }
    });
    // An estimate imported before heading rows were kept gets the same ones back from the saved reading.
    const old = { lines: plan.lines.map((l) => ({ ...l, headings: undefined })) } as unknown as Estimate;
    const back = addFileHeadings(old, [read]).lines;
    back.forEach((l, k) => { backN++; if (JSON.stringify(l.headings ?? []) !== JSON.stringify(plan.lines[k]!.headings ?? [])) { backBad++; out.push(`backfill | ${f.replace(ROOT, '')} | ${items[k]!.sheet} r${items[k]!.row} | ${JSON.stringify(l.headings)} vs ${JSON.stringify(plan.lines[k]!.headings)}`); } });
    // Numbered heading rows (a code, no quantity) between items must come out above their items.
    const printed = new Set(plan.lines.flatMap((l) => (l.headings ?? []).map((h) => `${h.code}|${h.text}`)));
    for (const s of read.skipped) {
      if (!sheets.has(s.sheet) || !s.code || !/heading or note/.test(s.reason)) continue;
      const lastItem = Math.max(...items.filter((i) => i.sheet === s.sheet).map((i) => i.row));
      if (s.row > lastItem) continue;
      heads++;
      if (!printed.has(`${s.code}|${s.description}`)) { headsBad++; out.push(`heading | ${f.replace(ROOT, '')} | ${s.sheet} r${s.row} | ${s.code} ${s.description.slice(0, 60)}`); }
    }
  }
  out.unshift(`codes ${n}, differ ${bad}; numbered headings ${heads}, missing ${headsBad}; backfilled lines ${backN}, differ ${backBad}`);
  writeFileSync(OUT, out.join('\n'));
}, 600000);
