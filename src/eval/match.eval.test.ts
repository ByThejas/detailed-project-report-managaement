import type { EstimateLine } from '@/features/preparation/types';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readBoqWorkbook, workbookToGrids } from '@/features/boq-import/readWorkbook';
import { planImport } from '@/features/boq-import/toEstimateLine';
import { jobContext, tonnesPerNo, buildIndex, suggestRates, certainMatch, isLabourOnly, suggestionFor, exactCodeMatch, tokens } from '@/features/rates/match';
import catalog from '@/data/rateCatalog.json';

/**
 * Measures rate matching on a folder of KPTCL estimate workbooks (the 21 in E:\BOQ). Opt-in and slow (~1 min):
 *   BOQ_DIR=E:/BOQ npx vitest run src/eval
 * Prints top-1/top-3 supply matches, trusted matches and erection/T&C agreement, and writes the misses to OUT_DIR.
 */
const ROOT = process.env.BOQ_DIR ?? '';
const OUT_DIR = process.env.OUT_DIR ?? tmpdir();
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const eq = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, 0.005 * Math.max(a, b));
const SHEETS: Record<string, (s: string) => boolean> = {
  electrical: (s) => s === 'By code' || s.startsWith('SR-CSR'),
  line: (s) => s === 'By code' || s.startsWith('SR-CSR'),
  civil: (s) => s.includes('Civil') || s.startsWith('utilization'),
  lineCivil: (s) => s.includes('Civil') || s === 'By code',
};

it.skipIf(!ROOT || !existsSync(ROOT))('match eval', async () => {
  const idx = buildIndex(catalog as never);
  const files = walk(ROOT).filter((f) => /\.xls[xm]?$/i.test(f) && !/\/BOQ [^/]*$|boq\.xlsx$/i.test(f));
  const seen = new Set<string>();
  const m = { lines: 0, attainable: 0, top1: 0, top3: 0, top1Att: 0, top3Att: 0, certain: 0, certainOk: 0, certainWrong: 0, ere: 0, ereOk: 0, tc: 0, tcOk: 0 };
  const bySection: Record<string, { n: number; att: number; top1: number }> = {};
  const misses: unknown[] = [];
  const results: Record<string, string> = {};
  const ereMiss: string[] = [];
  const feats: unknown[] = [];
  const CACHE = process.env.CACHE ?? '';
  let all: { f: string; lines: EstimateLine[] }[] = [];
  if (CACHE && existsSync(CACHE)) all = JSON.parse(readFileSync(CACHE, 'utf8'));
  else {
    for (const f of files) {
      const buf = readFileSync(f);
      try { await workbookToGrids(new Uint8Array(buf).buffer); } catch { /* */ }
      const read = await readBoqWorkbook(new Uint8Array(buf).buffer, f, 'electrical');
      const plan = planImport(read, read.items, new Set(read.sheets.filter((s) => s.includedByDefault).map((s) => s.name)), false);
      all.push({ f, lines: plan.lines });
    }
    if (CACHE) writeFileSync(CACHE, JSON.stringify(all));
  }
  for (const { f, lines } of all) {
    const job = process.env.NOJOB ? [] : jobContext(lines);
    for (const l0 of lines) {
      const l = { ...l0, basis: { tonnes: tonnesPerNo(l0) }, job };
      if (!(l.supplyRate > 0) || l.section === 'dismantling' || isLabourOnly(l.description)) continue;
      const key = `${l.section}|${l.description}|${l.unit}|${l.supplyRate}`;
      if (seen.has(key)) continue; // the same line in two copies of a workbook counts once
      seen.add(key);
      m.lines++;
      const bs = (bySection[l.section] ??= { n: 0, att: 0, top1: 0 });
      bs.n++;
      const allowed = SHEETS[l.section]!;
      const attainable = idx.items.some((it) => allowed(it.sheet) && (() => { const z = suggestionFor(it, l); return z.unitMatches && eq(z.supplyRate, l.supplyRate); })());
      if (attainable) { m.attainable++; bs.att++; }
      const sug = suggestRates(idx, l, 3);
      const ok1 = !!sug[0] && eq(sug[0].supplyRate, l.supplyRate);
      const ok3 = sug.some((s) => eq(s.supplyRate, l.supplyRate));
      if (ok1) { m.top1++; bs.top1++; if (attainable) m.top1Att++; }
      if (ok3) { m.top3++; if (attainable) m.top3Att++; }
      feats.push({ key, ok1, attainable, score: sug[0]?.score ?? 0, gap: sug[0] ? sug[0].score - (sug[1]?.score ?? 0) : 0, unit: sug[0]?.unitMatches ?? false, ntok: new Set(tokens(l.description)).size, labourOnly: isLabourOnly(l.description), certain: !!certainMatch(idx, l), sameRate2: !!sug[1] && eq(sug[1].supplyRate, sug[0]!.supplyRate) });
      const c = certainMatch(idx, l);
      results[key] = `${ok1 ? 'OK ' : 'BAD'} ${sug[0]?.item.code ?? '-'} ${sug[0]?.supplyRate ?? ''}${c ? ` CERTAIN ${c.item.code} ${eq(c.supplyRate, l.supplyRate) ? 'right' : 'WRONG'}` : ''}`;
      if (c) { m.certain++; if (eq(c.supplyRate, l.supplyRate)) m.certainOk++; else m.certainWrong++; }
      if (ok1 && (l.section === 'electrical' || l.section === 'line')) {
        const s = sug[0]!;
        const lab = (k: 'labour' | 'tc') => s.item[k].map((c) => `${c.rate}/${c.unit}`).join(' + ');
        if (l.erectionRate > 0) { m.ere++; if (eq(s.erectionRate, l.erectionRate)) m.ereOk++; else ereMiss.push(`ERE ${l.section} | ${l.unit} q${l.qty} | file ${l.erectionRate} got ${s.erectionRate} | ${s.item.code} [${s.item.unit}] L: ${lab('labour')} | ${l.description.slice(0, 70)}`); }
        if (l.testingRate > 0) { m.tc++; if (eq(s.testingRate, l.testingRate)) m.tcOk++; else ereMiss.push(`TC  ${l.section} | ${l.unit} q${l.qty} | file ${l.testingRate} got ${s.testingRate} | ${s.item.code} [${s.item.unit}] T: ${lab('tc')} | ${l.description.slice(0, 70)}`); }
      }
      if (attainable && !ok1) {
        const right = idx.items.filter((it) => allowed(it.sheet) && (() => { const z = suggestionFor(it, l); return z.unitMatches && eq(z.supplyRate, l.supplyRate); })()).slice(0, 3);
        misses.push({ file: f.split('/').pop(), section: l.section, desc: l.description, group: l.group, unit: l.unit, rate: l.supplyRate, srCode: l.srCode, exact: !!exactCodeMatch(idx, l),
          got: sug.map((s) => `${s.item.code} ${s.supplyRate} ${s.score.toFixed(3)} | ${s.item.item.slice(0, 90)} [${s.item.unit}]`),
          right: right.map((it) => `${it.sheet} ${it.code} ${it.rate} | ${it.item.slice(0, 120)} [${it.unit}]`) });
      }
    }
  }
  console.log(JSON.stringify({ files: files.length, ...m, bySection }));
  writeFileSync(join(OUT_DIR, 'eval-feats.json'), JSON.stringify(feats));
  writeFileSync(join(OUT_DIR, 'eval-erection.txt'), ereMiss.join('\n'));
  writeFileSync(join(OUT_DIR, 'eval-results.json'), JSON.stringify(results, null, 1));
  writeFileSync(join(OUT_DIR, 'eval-misses.json'), JSON.stringify(misses, null, 1));
}, 900000);
