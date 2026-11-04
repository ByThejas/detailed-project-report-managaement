import { useEffect, useMemo, useState } from 'react';
import { BookOpen, TriangleAlert } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatNumber } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { isMultiRate, type Estimate, type EstimateLine, type EstimateSection } from '@/features/preparation/types';
import { sectionLabel } from '@/features/boq-import/toEstimateLine';
import { loadRateCatalog } from './catalog';
import { applySuggestion, buildIndex, exactCodeMatch, isReliable, suggestRates, rateRefOf, suggestionFor, type RateIndex, type RateSuggestion } from './match';

const rs = (n: number) => formatNumber(Math.round(n * 100) / 100);
const PRICEABLE: EstimateSection[] = ['electrical', 'civil', 'line', 'lineCivil'];
const hasRate = (l: EstimateLine) => l.supplyRate > 0 || l.erectionRate > 0 || l.testingRate > 0;

/** Rates from a catalog item picked by its code, e.g. "1.10" or "By code 1.10". */
function byCode(index: RateIndex, line: EstimateLine, query: string): RateSuggestion | null {
  const q = query.trim();
  if (!q) return null;
  const sheetHint = q.includes(' ') ? q.slice(0, q.lastIndexOf(' ')).toLowerCase() : '';
  const code = q.split(' ').at(-1)!;
  const found = index.items.filter((i) => i.code === code && (!sheetHint || i.sheet.toLowerCase().includes(sheetHint)));
  const item = found.find((i) => i.sheet === 'By code') ?? found[0];
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
  const [index, setIndex] = useState<RateIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [section, setSection] = useState<EstimateSection | 'all'>('all');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [choices, setChoices] = useState<Record<string, Choice>>({});

  useEffect(() => {
    if (!open || index) return;
    let live = true;
    loadRateCatalog()
      .then((c) => live && setIndex(buildIndex(c)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, index]);

  const sections = PRICEABLE.filter((s) => estimate.lines.some((l) => l.section === s));
  const lines = estimate.lines.filter((l) => PRICEABLE.includes(l.section) && (section === 'all' || l.section === section) && l.description.trim() && (!onlyMissing || !hasRate(l)));
  const multiCols = section === 'all' ? lines.some((l) => isMultiRate(l.section)) : isMultiRate(section);
  const suggestions = useMemo(() => {
    const out = new Map<string, RateSuggestion[]>();
    if (index)
      for (const l of lines) {
        const exact = exactCodeMatch(index, l);
        const rest = suggestRates(index, l, 3).filter((x) => x.item.id !== exact?.item.id);
        out.set(l.id, exact ? [exact, ...rest.slice(0, 2)] : rest);
      }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, section, onlyMissing, estimate.lines]);

  // Only a line that names its SoR code, with that exact item found, starts ticked.
  const isExact = (id: string) => Boolean(suggestions.get(id)?.[0]?.exact);
  const choiceOf = (id: string): Choice => choices[id] ?? { pick: 0, code: '', apply: isExact(id) };
  const exactCount = lines.filter((l) => isExact(l.id)).length;
  const reliableIds = lines.filter((l) => !hasRate(l) && !isExact(l.id) && suggestions.get(l.id)?.[0] && isReliable(l, suggestions.get(l.id)![0]!)).map((l) => l.id);
  const setChoice = (id: string, patch: Partial<Choice>) => setChoices((c) => ({ ...c, [id]: { ...choiceOf(id), ...patch } }));
  const chosen = (l: EstimateLine): RateSuggestion | null => {
    const c = choiceOf(l.id);
    if (c.pick === -1) return index ? byCode(index, l, c.code) : null;
    return suggestions.get(l.id)?.[c.pick] ?? null;
  };
  const ticked = lines.filter((l) => choiceOf(l.id).apply && chosen(l));

  const apply = () => {
    const byId = new Map(ticked.map((l) => [l.id, chosen(l)!]));
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
        subtitle="Common SoR 2023-24 (rate_catalog 76): supply, erection and T&C rates. Items whose BOQ names the exact SoR code start ticked; every match by wording waits for your tick. Nothing is applied until you click Apply."
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
          </div>
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
            <div className="overflow-x-auto relative">
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
                      <tr key={l.id} className="border-b border-gray-100 align-top">
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
                                {x.exact ? 'Exact SoR code' : `${Math.round(x.score * 100)}%`} · {x.item.code} · {x.item.item.slice(0, 80)}
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
                          {s && !s.unitMatches && <p className="text-xs text-amber-700">Unit differs: catalog {s.item.unit}, BOQ {l.unit}.</p>}
                          {s && s.notApplied.length > 0 && (
                            <p className="text-xs text-amber-700">
                              Not added (needs another basis): {s.notApplied.map((n) => `${n.rate} per ${n.unit}`).join(', ')}
                            </p>
                          )}
                          {s && s.converted.length > 0 && <p className="text-xs text-gray-600">Per tonne, from the line’s tonnage: {s.converted.join('; ')}.</p>}
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
