import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readBoqWorkbook } from '@/features/boq-import/readWorkbook';
import { planImport } from '@/features/boq-import/toEstimateLine';
import { jobContext, buildIndex, suggestRates, certainMatch, oddRates, sorDifferences } from '@/features/rates/match';
import catalog from '@/data/rateCatalog.json';

/**
 * Proof that a speed-up changes nothing: snapshots, for every workbook in BOQ_DIR, what is read, the imported lines,
 * the top 3 rate suggestions of each line, certain matches, odd rates and SoR differences. Opt-in:
 *   BOQ_DIR=E:/BOQ OUT=before.json npx vitest run src/eval/snapshot   (before the change)
 *   BOQ_DIR=E:/BOQ OUT=after.json BASE=before.json npx vitest run src/eval/snapshot   (after: fails on any difference)
 * Times (ids, read time) are left out, so two runs of the same code are equal.
 */
const ROOT = process.env.BOQ_DIR ?? '';
const OUT = process.env.OUT ?? '';
const BASE = process.env.BASE ?? '';
const withoutId = <T extends { id: string }>(x: T) => ({ ...x, id: undefined });
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

it.skipIf(!ROOT || !existsSync(ROOT))('snapshot of reading and rate matching', async () => {
  const idx = buildIndex(catalog as never);
  const files = walk(ROOT).filter((f) => /\.xls[xm]?$/i.test(f)).sort();
  const snap: Record<string, unknown> = {};
  let matchMs = 0;
  for (const f of files) {
    const read = await readBoqWorkbook(new Uint8Array(readFileSync(f)).buffer, f, 'electrical');
    const plan = planImport(read, read.items, new Set(read.sheets.filter((s) => s.includedByDefault).map((s) => s.name)), false);
    const no = new Map(plan.lines.map((l, i) => [l.id, i]));
    const t = performance.now();
    const job = jobContext(plan.lines);
    const sug = plan.lines.map((l) => suggestRates(idx, { ...l, job }, 3).map((s) => [s.item.id, s.score, s.supplyRate, s.erectionRate, s.testingRate, s.shared]));
    const cert = plan.lines.map((l) => certainMatch(idx, l)?.item.id ?? null);
    const odd = oddRates(idx, plan.lines).map((o) => [no.get(o.line.id), o.match.item.id, o.ratio, o.why]);
    const diff = sorDifferences(idx, plan.lines).map((d) => [no.get(d.line.id), d.match.item.id]);
    matchMs += performance.now() - t;
    const items = read.items.map(withoutId);
    snap[f.slice(ROOT.length)] = { read: { ...read, readAt: undefined, items }, lines: plan.lines.map(withoutId), sug, cert, odd, diff };
  }
  const json = JSON.stringify(snap);
  if (OUT) writeFileSync(OUT, json);
  console.log(`matching took ${Math.round(matchMs)} ms over ${files.length} workbooks`);
  if (BASE) {
    const base = JSON.parse(readFileSync(BASE, 'utf8')) as Record<string, unknown>;
    const now = JSON.parse(json) as Record<string, unknown>;
    const differing = Object.keys({ ...base, ...now }).filter((k) => JSON.stringify(base[k]) !== JSON.stringify(now[k]));
    expect(differing).toEqual([]);
  }
}, 900000);
