import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workbookToGrids } from '@/features/boq-import/readWorkbook';
import { parseBoq, columnLetter } from '@/features/boq-import/parse';
import { planImport } from '@/features/boq-import/toEstimateLine';
import { lineAmounts } from '@/features/preparation/calc';
import { isMultiRate } from '@/features/preparation/types';

const ROOT = process.env.BOQ_DIR ?? '';
const OUT = process.env.OUT ?? '/tmp/exact.txt';
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const colIdx = (letter?: string) => { if (!letter) return undefined; let n = 0; for (const ch of letter) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v.replace(/,/g, ''))) ? Number(v.replace(/,/g, '')) : null);
void columnLetter;
/** Amounts compare at paise, as Excel shows them (a formula can leave 71971.875 behind a cell showing 71971.88). */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Imports every workbook in a folder (the 21 KPTCL estimates in E:\\BOQ) and compares each imported line's rates and
 * amounts with the cells of its row in the file, and each sheet total with the items read. Opt-in:
 *   BOQ_DIR=E:/BOQ OUT=diff.txt npx vitest run src/eval/exact.eval.test.ts
 */
it.skipIf(!ROOT || !existsSync(ROOT))('every imported rate and amount equals the file', async () => {
  const files = walk(ROOT).filter((f) => /\.xls[xm]?$/i.test(f));
  const out: string[] = [];
  const cats: Record<string, number> = {};
  let lines = 0, cells = 0, bad = 0, totalsChecked = 0, totalsOff = 0;
  const seen = new Set<string>();
  for (const f of files) {
    const buf = readFileSync(f);
    const key = `${buf.length}`; if (seen.has(key + f.split('/').pop())) continue; seen.add(key + f.split('/').pop());
    const grids = await workbookToGrids(new Uint8Array(buf).buffer);
    const read = parseBoq(grids, f.split('/').pop()!, 'electrical');
    const sheets = new Set(read.sheets.filter((s) => s.includedByDefault && s.headerRow).map((s) => s.name));
    const items = read.items.filter((i) => sheets.has(i.sheet) && !i.issues.some((x) => x.level === 'error'));
    const plan = planImport(read, items, sheets, true);
    for (const t of read.totals) if (sheets.has(t.sheet)) { totalsChecked++; if (Math.abs(t.stated - t.computed) > 1) { totalsOff++; out.push(`total | ${f.replace(ROOT, '')} | ${t.sheet} r${t.row} ${t.label} ${t.column}: file ${t.stated} app ${t.computed}`); } }
    plan.lines.forEach((l, k) => {
      const it = items[k]!;
      const sum = read.sheets.find((s) => s.name === it.sheet)!;
      const grid = grids.find((g) => g.name === it.sheet)!;
      const row = grid.rows[it.row - 1] ?? [];
      const a = lineAmounts(l);
      lines++;
      const kinds = ['supply', 'erection', 'testing'] as const;
      const multi = isMultiRate(l.section);
      const fileAmt = (kd: string) => num(row[colIdx(sum.columns[`${kd}Amount` as never])!] ?? null);
      const fileRate = (kd: string) => num(row[colIdx(sum.columns[`${kd}Rate` as never])!] ?? null);
      const report = (cat: string, msg: string) => { bad++; cats[cat] = (cats[cat] ?? 0) + 1; out.push(`${cat} | ${f.replace(ROOT, '')} | ${it.sheet} r${it.row} | ${msg} | ${l.description.slice(0, 60)}`); };
      if (multi) {
        for (const kd of kinds) {
          const fr = fileRate(kd), fa = fileAmt(kd);
          const ar = l[`${kd}Rate`], aa = a[kd];
          if (fr !== null || ar) { cells++; if (fr !== null ? Math.abs(fr - ar) > 1e-6 : ar !== 0 && fa === null) report(`rate-${kd}`, `file ${fr} app ${ar} (amt file ${fa} app ${aa})`); }
          if (fa !== null || aa) { cells++; if (Math.abs(r2(fa ?? 0) - r2(aa)) > 0.001) report(`amount-${kd}`, `file ${fa} app ${aa} (rate file ${fr} app ${ar}, qty ${l.qty})`); }
        }
      } else {
        const fa = kinds.reduce((s, kd) => s + (fileAmt(kd) ?? 0), 0);
        const frs = kinds.map(fileRate).filter((x) => x !== null) as number[];
        const fr = frs.reduce((s, x) => s + x, 0);
        cells += 2;
        if (frs.length && Math.abs(fr - l.supplyRate) > 1e-6) report('rate-single', `file ${fr} app ${l.supplyRate} (amt file ${fa} app ${a.supply})`);
        if (Math.abs(r2(fa) - r2(a.supply)) > 0.001) report('amount-single', `file ${fa} app ${a.supply} (rate ${fr}/${l.supplyRate} qty ${l.qty})`);
      }
    });
  }
  out.unshift(`${files.length} files, ${lines} lines, ${cells} cells compared, ${bad} mismatches; ${totalsChecked} sheet totals, ${totalsOff} differ by more than Re 1`, JSON.stringify(cats));
  writeFileSync(OUT, out.join('\n'));
  console.log(out.slice(0, 2).join('\n'));
}, 600_000);
