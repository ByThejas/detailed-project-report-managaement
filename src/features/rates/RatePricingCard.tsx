import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { BookOpen, TriangleAlert } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatNumber } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { isMultiRate, type Estimate, type EstimateLine, type EstimateSection } from '@/features/preparation/types';
import { sectionLabel } from '@/features/boq-import/toEstimateLine';
import { catalogName, useRateCatalog } from './catalog';
import { forgetChoices, recalledChoices, rememberChoices, rememberedCount } from './memory';
import { allItems, applySuggestion, exactCodeMatch, isReliable, isWeakMatch, jobContext, oddRates, sorDifferences, type SorDifference, ratingDifferences, suggestRates, isSetBasis, nosInSet, rateRefOf, suggestionFor, tonnesPerNo, unitBasis, usualSetNos, type LabourBasis, type OddRate, type RateIndex, type RateSuggestion } from './match';

const rs = (n: number) => formatNumber(Math.round(n * 100) / 100);
const PRICEABLE: EstimateSection[] = ['electrical', 'civil', 'line', 'lineCivil'];
const hasRate = (l: EstimateLine) => l.supplyRate > 0 || l.erectionRate > 0 || l.testingRate > 0;

/** Rates from a catalog item picked by its code, e.g. "1.10" or "By code 1.10". */
function byCode(index: RateIndex, line: EstimateLine, query: string): RateSuggestion | null {
  const q = query.trim();
  if (!q) return null;
  const sheetHint = q.includes(' ') ? q.slice(0, q.lastIndexOf(' ')).toLowerCase() : '';
  const code = q.split(' ').at(-1)!;
  // Civil parts look in the civil schedule of rates first, when the user added one.
  const civilLine = line.section === 'civil' || line.section === 'lineCivil';
  const pool = civilLine && index.civil ? [...index.civil.items, ...index.items] : allItems(index);
  const found = pool.filter((i) => i.code === code && (!sheetHint || i.sheet.toLowerCase().includes(sheetHint)));
  const item = (civilLine ? undefined : found.find((i) => i.sheet === 'By code')) ?? found[0];
  if (!item) return null;
  return suggestionFor(item, line);
}


interface Choice {
  /** Index into the line's suggestions, or -1 for a code typed by hand. */
  pick: number;
  code: string;
  apply: boolean;
}

/**
 * Prices BOQ lines from the KPTCL rate catalog. Matching is by description, so nothing is applied until
 * the user ticks a line; each suggestion shows the SoR item, page and how alike the texts are. A code
 * typed by hand (e.g. 1.10) takes the exact catalog item instead.
 */
export function RatePricingCard({ estimate, onChange, defaultOpen = false }: { estimate: Estimate; onChange: (e: Estimate) => void; defaultOpen?: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(defaultOpen);
  // The catalog kept in the Rate Catalog page; loaded once the card is opened, and again when it changes.
  const { catalog, civil, index, failed } = useRateCatalog(open);
  const [section, setSection] = useState<EstimateSection | 'all'>('all');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [onlyOdd, setOnlyOdd] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);
  /** Per line: how SoR labour per Set, per tonne or per tonne-metre turns into a rate per No. */
  const [bases, setBases] = useState<Record<string, LabourBasis>>({});
  // Bumped when remembered choices change, so the suggestions are worked out again.
  const [memoryVersion, setMemoryVersion] = useState(0);

  const sections = PRICEABLE.filter((s) => estimate.lines.some((l) => l.section === s));
  // Rates already in the estimate that sit far from the SoR item the line surely is.
  const odd = useMemo(() => (index ? oddRates(index, estimate.lines.filter((l) => PRICEABLE.includes(l.section))) : []), [index, estimate.lines]);
  const oddById = new Map<string, OddRate>(odd.map((o) => [o.line.id, o]));
  // Rates that are not the rate of the SoR item the line surely is. Listed for review; they are not ticked for the user.
  const diffs = useMemo(() => (index ? sorDifferences(index, estimate.lines.filter((l) => PRICEABLE.includes(l.section))) : []), [index, estimate.lines]);
  const diffById = new Map<string, SorDifference>(diffs.map((d) => [d.line.id, d]));
  const lines = estimate.lines.filter(
    (l) =>
      PRICEABLE.includes(l.section) &&
      (section === 'all' || l.section === section) &&
      l.description.trim() &&
      (onlyDiff ? diffById.has(l.id) : onlyOdd ? oddById.has(l.id) : !onlyMissing || !hasRate(l) || diffById.has(l.id)),
  );
  const multiCols = section === 'all' ? lines.some((l) => isMultiRate(l.section)) : isMultiRate(section);
  const suggestions = useMemo(() => {
    const out = new Map<string, RateSuggestion[]>();
    if (index) {
      const recalled = recalledChoices(index, lines);
      // What the whole estimate says (its one conductor, existing towers, ampacity) helps lines that leave it out.
      const job = jobContext(estimate.lines);
      for (const l of lines) {
        // The line's own SR code first, then the item chosen before for this wording, then matches by wording.
        const first = exactCodeMatch(index, l) ?? recalled.get(l.id) ?? diffById.get(l.id)?.match ?? null;
        const rest = suggestRates(index, { ...l, job }, 3).filter((x) => x.item.id !== first?.item.id);
        out.set(l.id, first ? [first, ...rest.slice(0, 2)] : rest);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, section, onlyMissing, onlyOdd, onlyDiff, diffs, estimate.lines, memoryVersion]);

  // Only a line that names its SoR code, with that exact item found, starts ticked.
  const isExact = (id: string) => Boolean(suggestions.get(id)?.[0]?.exact);
  // A rate already on the line (the uploaded estimate's own) is never pre-ticked: only lines with no rate start ticked,
  // and only when the BOQ names the exact SoR code. Replacing a file's rate always takes the user's own tick.
  const lineById = new Map(estimate.lines.map((l) => [l.id, l]));
  const choiceOf = (id: string): Choice => choices[id] ?? { pick: 0, code: '', apply: isExact(id) && !hasRate(lineById.get(id)!) };
  const exactCount = lines.filter((l) => isExact(l.id)).length;
  const isRemembered = (id: string) => Boolean(suggestions.get(id)?.[0]?.remembered);
  const rememberedIds = lines.filter((l) => !hasRate(l) && isRemembered(l.id)).map((l) => l.id);
  const reliableIds = lines.filter((l) => !hasRate(l) && !isExact(l.id) && !isRemembered(l.id) && suggestions.get(l.id)?.[0] && isReliable(l, suggestions.get(l.id)![0]!, suggestions.get(l.id)![1] ?? null)).map((l) => l.id);
  const setChoice = (id: string, patch: Partial<Choice>) => setChoices((c) => ({ ...c, [id]: { ...choiceOf(id), ...patch } }));
  const basisOf = (l: EstimateLine): LabourBasis => ({ tonnes: tonnesPerNo(l), ...bases[l.id] });
  const setBasis = (id: string, patch: Partial<LabourBasis>) => setBases((b) => ({ ...b, [id]: { ...b[id], ...patch } }));
  const chosen = (l: EstimateLine): RateSuggestion | null => {
    const c = choiceOf(l.id);
    const raw = c.pick === -1 ? (index ? byCode(index, l, c.code) : null) : (suggestions.get(l.id)?.[c.pick] ?? null);
    if (!raw) return null;
    // Re-priced with the line's basis, so labour per Set or per tonne becomes a rate per No.
    return { ...raw, ...suggestionFor(raw.item, { ...l, basis: basisOf(l) }, raw.score, raw.shared) };
  };
  /** Which bases the chosen item's labour and T&C need, for a line counted in Nos. */
  const basisNeeds = (l: EstimateLine, s: RateSuggestion) => {
    if (!isMultiRate(l.section) || unitBasis(l.unit) !== 'no') return { set: false, setNosStated: undefined as number | undefined, weight: false, distance: false };
    const kinds = [...s.item.labour, ...s.item.tc].map((c) => unitBasis(c.unit));
    const setUnit = [s.item.unit, ...s.item.labour.map((c) => c.unit), ...s.item.tc.map((c) => c.unit)].find((u) => isSetBasis(unitBasis(u)));
    return { set: Boolean(setUnit), setNosStated: setUnit ? nosInSet(setUnit) : undefined, weight: kinds.includes('weight') || kinds.includes('weightDistance'), distance: kinds.includes('weightDistance') };
  };
  const ticked = lines.filter((l) => choiceOf(l.id).apply && chosen(l));

  // Keyboard: ↑/↓ (or k/j) move between items, 1–3 pick that match, Space (or x) ticks the item. Keys typed in a
  // box or a list (an SoR code, a weight, the match list's own arrows) are left alone.
  const [activeId, setActiveId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const onKeys = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const t = ev.target as HTMLElement;
    const onCheckbox = t instanceof HTMLInputElement && t.type === 'checkbox';
    if (t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !onCheckbox)) return;
    const at = lines.findIndex((l) => l.id === activeId);
    const go = (i: number) => {
      const l = lines[Math.max(0, Math.min(lines.length - 1, i))];
      if (!l) return;
      setActiveId(l.id);
      const row = rowRefs.current.get(l.id);
      row?.focus();
      row?.scrollIntoView?.({ block: 'nearest' });
    };
    if (ev.key === 'ArrowDown' || ev.key === 'j') {
      ev.preventDefault();
      go(at < 0 ? 0 : at + 1);
      return;
    }
    if (ev.key === 'ArrowUp' || ev.key === 'k') {
      ev.preventDefault();
      go(at < 0 ? 0 : at - 1);
      return;
    }
    const l = lines[at];
    if (!l) return;
    if (ev.key === '1' || ev.key === '2' || ev.key === '3') {
      const n = Number(ev.key) - 1;
      if (suggestions.get(l.id)?.[n]) {
        ev.preventDefault();
        setChoice(l.id, { pick: n });
      }
      return;
    }
    // Space on the row's own checkbox already ticks it.
    if ((ev.key === ' ' && !onCheckbox) || ev.key === 'x') {
      ev.preventDefault();
      if (chosen(l)) setChoice(l.id, { apply: !choiceOf(l.id).apply });
    }
  };

  const apply = () => {
    const byId = new Map(ticked.map((l) => [l.id, chosen(l)!]));
    rememberChoices(ticked.map((l) => ({ line: l, suggestion: byId.get(l.id)! })));
    setMemoryVersion((v) => v + 1);
    let keptCount = 0;
    onChange({
      ...estimate,
      lines: estimate.lines.map((l) => {
        const s = byId.get(l.id);
        if (!s) return l;
        const out = applySuggestion(l, s);
        if (out.kept.length) keptCount += 1;
        return out.line;
      }),
    });
    const where = section === 'all' ? 'All parts' : sectionLabel(section);
    toast({
      title: `Priced ${byId.size} ${byId.size === 1 ? 'item' : 'items'} from the rate catalog`,
      description: keptCount ? `${where}. ${keptCount} kept their own erection or T&C rate, as the catalog has none in their unit.` : where,
    });
    setChoices({});
  };

  return (
    <Card role="region" aria-labelledby="rates-title">
      <CardHeader
        id="rates-title"
        title="Price from the rate catalog"
        subtitle={`${catalog ? catalogName(catalog) : 'The rate catalog'}${civil ? ` and the civil catalog ${catalogName(civil)}` : ''} (kept in the Rate Catalog page): supply, erection and T&C rates. Items with no rate whose BOQ names the exact SoR code start ticked; rates already in the estimate, and every match by wording, wait for your tick. Nothing is applied until you click Apply.`}
        action={
          <button type="button" className="btn-secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            {open ? 'Close' : 'Find rates'}
          </button>
        }
      />
      {open && (
        <div className="text-[13px]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-200 px-4 py-2.5">
            <label className="flex items-center gap-1.5 text-gray-600">
              Part
              <select className="input h-8 w-auto" value={section} onChange={(ev) => setSection(ev.target.value as EstimateSection | 'all')}>
                <option value="all">All parts</option>
                {(sections.length ? sections : PRICEABLE).map((s) => (
                  <option key={s} value={s}>
                    {sectionLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-gray-600">
              <input type="checkbox" checked={onlyMissing} onChange={(ev) => setOnlyMissing(ev.target.checked)} />
              Only items without a rate
            </label>
            <span className="text-xs text-gray-500">Or type an SoR code in a row (e.g. 1.10) to take that exact item.</span>
            <span className="text-xs text-gray-400">Keys: ↑ ↓ move between items · 1 2 3 pick a match · Space ticks</span>
          </div>
          {diffs.length > 0 && (
            <div role="status" aria-label="Rates that differ from the SoR" className="border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900">
              <p className="flex items-start gap-1.5 font-medium">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {diffs.length} {diffs.length === 1 ? 'rate differs' : 'rates differ'} from the SoR item the line surely is. The estimate keeps its own {diffs.length === 1 ? 'rate' : 'rates'}; tick a row below only if you want the SoR rate instead.
                <button type="button" className="btn-ghost -my-1 ml-auto h-7 text-xs" onClick={() => setOnlyDiff((v) => !v)}>
                  {onlyDiff ? 'Show all items' : 'Show only these'}
                </button>
              </p>
              <ul className="mt-1 space-y-0.5 pl-5">
                {diffs.slice(0, 8).map((d) => (
                  <li key={d.line.id}>
                    {d.line.code || d.line.description.slice(0, 40)}: Rs {rs(d.line.supplyRate)} per {d.line.unit} in the estimate, SoR {d.match.item.code} is Rs {rs(d.match.supplyRate)}.
                  </li>
                ))}
                {diffs.length > 8 && <li>…and {diffs.length - 8} more.</li>}
              </ul>
            </div>
          )}
          {odd.length > 0 && (
            <div role="status" aria-label="Rates far from the SoR" className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
              <p className="flex items-start gap-1.5 font-medium">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {odd.length} {odd.length === 1 ? 'rate in the estimate looks' : 'rates in the estimate look'} wrong: taken from an SoR item of another rating, or more than 1.5× away from the SoR item the line names or closely matches.
                <button type="button" className="btn-ghost -my-1 ml-auto h-7 text-xs" onClick={() => setOnlyOdd((v) => !v)}>
                  {onlyOdd ? 'Show all items' : 'Show only these'}
                </button>
              </p>
              <ul className="mt-1 space-y-0.5 pl-5">
                {odd.slice(0, 8).map((o) => (
                  <li key={o.line.id}>
                    {o.line.code || o.line.description.slice(0, 40)}: Rs {rs(o.line.supplyRate)} per {o.line.unit}, SoR {o.match.item.code} is Rs {rs(o.match.supplyRate)}. It {o.why}.
                  </li>
                ))}
                {odd.length > 8 && <li>…and {odd.length - 8} more.</li>}
              </ul>
            </div>
          )}
          {failed ? (
            <p role="status" className="px-4 py-3 text-rose-700">
              The rate catalog could not be loaded.
            </p>
          ) : !index ? (
            <p role="status" className="px-4 py-3 text-gray-500">
              Loading the rate catalog…
            </p>
          ) : !lines.length ? (
            <p role="status" className="px-4 py-3 text-gray-500">
              {onlyMissing ? 'Every item in this part already has a rate. Untick “Only items without a rate” to check them against the catalog.' : 'No items in this part.'}
            </p>
          ) : (
            <div className="overflow-x-auto relative" role="group" tabIndex={0} aria-label="Rate suggestions: arrow keys move between items, 1 to 3 pick a match, Space ticks" onKeyDown={onKeys}>
              <table className="w-full min-w-[960px]" aria-label="Rate suggestions">
                <thead className="text-xs text-gray-500">
                  <tr className="border-b border-gray-100">
                    <th className="w-8 py-2 pl-4" />
                    <th className="py-2 text-left font-medium">BOQ item</th>
                    <th className="py-2 text-left font-medium">Catalog item</th>
                    <th className="py-2 pr-2 text-right font-medium">Supply rate</th>
                    <th className="py-2 pr-2 text-right font-medium">Supply amount</th>
                    {multiCols && (
                      <>
                        <th className="py-2 pr-2 text-right font-medium">Erection rate</th>
                        <th className="py-2 pr-2 text-right font-medium">Erection amount</th>
                        <th className="py-2 pr-4 text-right font-medium">T&amp;C rate</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const sugg = suggestions.get(l.id) ?? [];
                    const c = choiceOf(l.id);
                    const s = chosen(l);
                    const next = s ? applySuggestion(l, s).line : null;
                    const differs =
                      next && hasRate(l) && (Math.abs(next.supplyRate - l.supplyRate) > 0.5 || Math.abs(next.erectionRate - l.erectionRate) > 0.5 || Math.abs(next.testingRate - l.testingRate) > 0.5);
                    return (
                      <tr
                        key={l.id}
                        ref={(el) => {
                          if (el) rowRefs.current.set(l.id, el);
                          else rowRefs.current.delete(l.id);
                        }}
                        tabIndex={-1}
                        onFocus={() => setActiveId(l.id)}
                        onClick={() => setActiveId(l.id)}
                        aria-current={activeId === l.id ? 'true' : undefined}
                        className={`border-b border-gray-100 align-top outline-none ${activeId === l.id ? 'bg-sky-50' : ''}`}
                      >
                        <td className="py-2 pl-4">
                          <input type="checkbox" aria-label={`Apply catalog rate to ${l.code || l.description.slice(0, 30)}`} disabled={!s} checked={c.apply && Boolean(s)} onChange={(ev) => setChoice(l.id, { apply: ev.target.checked })} />
                        </td>
                        <td className="max-w-[18rem] py-2 pr-3">
                          {section === 'all' && <p className="text-[11px] uppercase tracking-wide text-gray-400">{sectionLabel(l.section)}</p>}
                          <p className="line-clamp-3 text-gray-900">
                            <span className="num text-gray-400">{l.code} </span>
                            {l.description}
                          </p>
                          <p className="text-xs text-gray-500">
                            {l.qty} {l.unit}
                            {hasRate(l) && ` · now ${rs(l.supplyRate)}${isMultiRate(l.section) ? ` / ${rs(l.erectionRate)} / ${rs(l.testingRate)}` : ''}`}
                          </p>
                          {oddById.has(l.id) && <p className="text-xs text-amber-700">Rate in the estimate {oddById.get(l.id)!.why}.</p>}
                        </td>
                        <td className="max-w-[24rem] py-2 pr-3">
                          <select
                            aria-label={`Catalog match for ${l.code || l.description.slice(0, 30)}`}
                            className="input h-8 w-full text-xs"
                            value={c.pick}
                            onChange={(ev) => setChoice(l.id, { pick: Number(ev.target.value) })}
                          >
                            {sugg.map((x, i) => (
                              <option key={x.item.id} value={i}>
                                {x.exact ? 'Exact SoR code' : x.remembered ? 'Your earlier choice' : `${Math.round(x.score * 100)}%`} · {x.item.code} · {x.item.item.slice(0, 80)}
                              </option>
                            ))}
                            <option value={-1}>SoR code typed by hand…</option>
                          </select>
                          {c.pick === -1 && (
                            <input aria-label={`SoR code for ${l.code || l.description.slice(0, 30)}`} className="input mt-1 h-7 text-xs" placeholder="e.g. 1.10" value={c.code} onChange={(ev) => setChoice(l.id, { code: ev.target.value })} />
                          )}
                          {s ? (
                            <p className="mt-1 text-xs text-gray-500">
                              {s.item.context && <span>{s.item.context.slice(0, 60)} · </span>}
                              {s.item.unit} · {rateRefOf(s)}
                            </p>
                          ) : (
                            c.pick === -1 && c.code && <p className="mt-1 text-xs text-rose-700">No item with that code.</p>
                          )}
                          {c.pick !== -1 && sugg.length > 0 && isWeakMatch(sugg[0]) && (
                            <p className="text-xs text-amber-700">
                              No close SoR item: these are only loose guesses, and {l.section === 'civil' || l.section === 'lineCivil' ? (civil ? `neither SoR 76 nor ${catalogName(civil)} may list this item` : 'SoR 76 may not list this item (most civil work is priced from the KPWD schedule: add it under Rate Catalog, Civil)') : 'SoR 76 may not list this item'}. Enter the rate from the approved source, or type the SoR code.
                            </p>
                          )}
                          {s && ratingDifferences(l, s.item).length > 0 && (
                            <p className="text-xs font-medium text-rose-700">Not the same rating: {ratingDifferences(l, s.item).join('; ')}. Check before ticking.</p>
                          )}
                          {sugg.length > 0 && sugg.every((x) => ratingDifferences(l, x.item).length > 0) && (
                            <p className="text-xs text-rose-700">None of these has the BOQ’s rating: the SoR may not list this item. Enter the rate from the approved source, or type the right SoR code.</p>
                          )}
                          {s && !s.unitMatches && <p className="text-xs text-amber-700">Unit differs: catalog {s.item.unit}, BOQ {l.unit}.{basisNeeds(l, s).set && ' Choose what one Set is below.'}</p>}
                          {s && (() => {
                            const need = basisNeeds(l, s);
                            if (!need.set && !need.weight) return null;
                            const b = basisOf(l);
                            const label = l.code || l.description.slice(0, 30);
                            return (
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-700">
                                {need.set && (
                                  <label className="flex items-center gap-1">
                                    SoR rate per Set:
                                    <select
                                      aria-label={`Nos in one Set for ${label}`}
                                      className="input h-7 w-auto text-xs"
                                      value={b.setNos ?? need.setNosStated ?? usualSetNos(s.item)}
                                      onChange={(ev) => setBasis(l.id, { setNos: Number(ev.target.value) })}
                                    >
                                      <option value={0}>Not added</option>
                                      {[...new Set([need.setNosStated ?? 3, 1, 3])].sort((a, z) => a - z).map((n) => (
                                        <option key={n} value={n}>
                                          1 Set = {n} {n === 1 ? 'No' : 'Nos'}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                )}
                                {need.weight && (
                                  <label className="flex items-center gap-1">
                                    Weight per No (t):
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      aria-label={`Weight per No in tonnes for ${label}`}
                                      className="input h-7 w-20 text-xs"
                                      value={b.tonnes ?? ''}
                                      onChange={(ev) => setBasis(l.id, { tonnes: ev.target.value === '' ? undefined : Number(ev.target.value) })}
                                    />
                                  </label>
                                )}
                                {need.distance && (
                                  <label className="flex items-center gap-1">
                                    Moving distance (m):
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      aria-label={`Moving distance in metres for ${label}`}
                                      className="input h-7 w-20 text-xs"
                                      value={b.metres ?? ''}
                                      onChange={(ev) => setBasis(l.id, { metres: ev.target.value === '' ? undefined : Number(ev.target.value) })}
                                    />
                                  </label>
                                )}
                              </div>
                            );
                          })()}
                          {s && s.notApplied.length > 0 && (
                            <p className="text-xs text-amber-700">
                              Not added (needs a basis above): {s.notApplied.map((n) => `${n.rate} per ${n.unit}`).join(', ')}
                            </p>
                          )}
                          {s && s.converted.length > 0 && <p className="text-xs text-gray-600">Converted to the line’s unit: {s.converted.join('; ')}.</p>}
                          {s && isMultiRate(l.section) && s.erectionRate === 0 && l.erectionRate > 0 && (
                            <p className="text-xs text-gray-600">No erection rate in this unit in the catalog: the line keeps its own ({rs(l.erectionRate)}).</p>
                          )}
                          {s && isMultiRate(l.section) && s.testingRate === 0 && l.testingRate > 0 && (
                            <p className="text-xs text-gray-600">No T&amp;C rate in this unit in the catalog: the line keeps its own ({rs(l.testingRate)}).</p>
                          )}
                          {differs && <p className="text-xs text-amber-700">Differs from the rate in the estimate.</p>}
                        </td>
                        <td className="num py-2 pr-2 text-right">{s ? rs(s.supplyRate) : '—'}</td>
                        <td className="num py-2 pr-2 text-right text-gray-600">{s ? rs(s.supplyRate * l.qty) : '—'}</td>
                        {multiCols && (
                          <>
                            <td className="num py-2 pr-2 text-right">{next ? rs(next.erectionRate) : '—'}</td>
                            <td className="num py-2 pr-2 text-right text-gray-600">{next ? rs(next.erectionRate * l.qty) : '—'}</td>
                            <td className="num py-2 pr-4 text-right">{next ? rs(next.testingRate) : '—'}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {index && lines.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <p className="flex items-start gap-1.5 text-xs text-amber-900">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {exactCount ? `${exactCount} ${exactCount === 1 ? 'item names its' : 'items name their'} SoR code and ${exactCount === 1 ? 'is' : 'are'} ticked. ` : ''}Other matches are by wording: “close matches” (very close wording, same numbers and unit) are safe to tick; check the rest against the SoR page first. Labour-only items (testing, re-erection, excavation) are never given a supply rate.
              </p>
              {exactCount > 0 && (
                <button
                  type="button"
                  className="btn-ghost h-8 text-xs"
                  onClick={() => setChoices((c) => Object.fromEntries([...Object.entries(c), ...lines.filter((l) => isExact(l.id)).map((l) => [l.id, { pick: 0, code: '', apply: true }])]))}
                >
                  Tick all exact-code matches
                </button>
              )}
              {rememberedIds.length > 0 && (
                <button type="button" className="btn-ghost h-8 text-xs" onClick={() => setChoices((c) => Object.fromEntries([...Object.entries(c), ...rememberedIds.map((id) => [id, { pick: 0, code: '', apply: true }])]))}>
                  Tick {rememberedIds.length} earlier {rememberedIds.length === 1 ? 'choice' : 'choices'}
                </button>
              )}
              {rememberedCount() > 0 && (
                <button
                  type="button"
                  className="btn-ghost h-8 text-xs text-gray-500"
                  title="Items you applied before are offered first for the same wording. This forgets them in this browser."
                  onClick={() => {
                    forgetChoices();
                    setMemoryVersion((v) => v + 1);
                  }}
                >
                  Forget earlier choices
                </button>
              )}
              {reliableIds.length > 0 && (
                <button type="button" className="btn-ghost h-8 text-xs" onClick={() => setChoices((c) => Object.fromEntries([...Object.entries(c), ...reliableIds.map((id) => [id, { pick: 0, code: '', apply: true }])]))}>
                  Tick {reliableIds.length} close matches
                </button>
              )}
              <button type="button" className="btn-primary ml-auto" disabled={!ticked.length} onClick={apply}>
                Apply rates to {ticked.length} {ticked.length === 1 ? 'item' : 'items'}
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
