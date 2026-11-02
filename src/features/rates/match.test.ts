import catalog from '@/data/rateCatalog.json';
import { buildIndex, highestKv, rateRefOf, suggestRates, suggestionFor, tokens, unitKind } from './match';
import type { RateCatalog } from './types';

const index = buildIndex(catalog as RateCatalog);
const byCode = (code: string) => index.items.find((i) => i.sheet === 'By code' && i.code === code)!;

describe('rate catalog', () => {
  it('holds the SoR items with their labour and T&C rates', () => {
    const pt = byCode('1.10');
    expect(pt.rate).toBe(31_247_000);
    expect(pt.item).toMatch(/66\/11 kV/);
    expect(pt.labour.length + pt.tc.length).toBeGreaterThan(0);
  });

  it('suggests the 20 MVA 66/11 kV transformer for the Kogali BOQ line', () => {
    const s = suggestRates(index, { description: 'Power Transformer: a) 20 MVA, 66/11kV, Delta/Star, Dyn11, 3-Ph, 50Hz, Core Type, 2 Winding', unit: "No's", section: 'electrical' });
    expect(s.map((x) => x.item.code)).toContain('1.10');
  });

  it('adds only labour and T&C rates in the line’s own unit, and lists the rest', () => {
    const s = suggestionFor(byCode('1.10'), { unit: 'No', section: 'electrical' });
    expect(s.supplyRate).toBe(31_247_000);
    expect(s.notApplied.some((c) => unitKind(c.unit) === 'weight' || unitKind(c.unit) === 'weightDistance')).toBe(true);
    expect(s.erectionRate).toBe(byCode('1.10').labour.filter((c) => unitKind(c.unit) === 'count').reduce((t, c) => t + c.rate, 0));
    expect(rateRefOf(s)).toBe(`SoR 2023-24 · By code 1.10 · ${byCode('1.10').sr}`);
    // Civil and other single-rate parts take only the supply rate.
    expect(suggestionFor(byCode('1.10'), { unit: 'No', section: 'civil' }).erectionRate).toBe(0);
  });

  it('reads units and words the way BOQs write them', () => {
    expect(unitKind("No's")).toBe('count');
    expect(unitKind('No (3.162 MT)')).toBe('count');
    expect(unitKind('Mtrs.')).toBe('length');
    expect(unitKind('t/m')).toBe('weightDistance');
    expect(unitKind('m³')).toBe('volume');
    expect(tokens('20MVA, 66/11kV Drake ACSR')).toEqual(['20', '20mva', 'mva', '66', '11', '11kv', 'kv', 'drake', 'acsr']);
  });
});

describe('voltage class', () => {
  it('reads the highest kV class of a text', () => {
    expect(highestKv('Power transformer 8 MVA, 110/11 kV, Dyn11')).toBe(110);
    expect(highestKv('66/11kV Delta/Star')).toBe(66);
    expect(highestKv('Drake ACSR')).toBeNull();
  });

  it('keeps the nearest 8 MVA item in the three shown, though the catalog has no 110/11 kV 8 MVA item', () => {
    const s = suggestRates(index, { description: 'Power transformer 8 MVA, 110/11 kV, Dyn11, OLTC, ONAN/ONAF, with RTCC panel, first oil filling and 10% spare oil', unit: 'No', section: 'electrical' }, 3);
    expect(s.map((x) => x.item.code)).toContain('1.13');
    expect(index.items.some((i) => /8 MVA/.test(i.item) && /110/.test(i.item) && /11 kV/.test(i.item))).toBe(false);
  });
});
