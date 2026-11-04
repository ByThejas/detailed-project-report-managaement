import catalog from '@/data/rateCatalog.json';
import { newLine } from '@/features/preparation/template';
import { applySuggestion, buildIndex, exactCodeMatch, highestKv, isLabourOnly, isReliable, rateRefOf, suggestRates, suggestionFor, tokens, unitBasis, unitFactor, unitKind } from './match';
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

  it('takes an item by the SoR code the BOQ names only when the code, part and unit all agree', () => {
    const pt = exactCodeMatch(index, { unit: 'No', section: 'electrical', srCode: '1.10' });
    expect(pt?.exact).toBe(true);
    expect(pt?.supplyRate).toBe(31_247_000);
    // Wrong unit, a civil line with an electrical code, or no code: nothing is taken.
    expect(exactCodeMatch(index, { unit: 'cum', section: 'electrical', srCode: '1.10' })).toBeNull();
    expect(exactCodeMatch(index, { unit: 'No', section: 'civil', srCode: '1.10' })).toBeNull();
    expect(exactCodeMatch(index, { unit: 'No', section: 'electrical' })).toBeNull();
  });
});

describe('units and kept rates', () => {
  const item = (unit: string, labour: { unit: string; rate: number }[], tc: { unit: string; rate: number }[] = []) => ({
    id: 'x',
    sheet: 'By code',
    code: '9.9',
    kind: 'Supply',
    item: 'Test item',
    context: '',
    unit,
    rate: 1000,
    sr: 'p1',
    labour: labour.map((c) => ({ ...c, text: 'labour', sr: '' })),
    tc: tc.map((c) => ({ ...c, text: 'tc', sr: '' })),
  });

  it('does not price a line in Nos with a rate per set of three', () => {
    expect(unitBasis('Set (3 Nos.)')).toBe('set of 3');
    expect(unitBasis('per Set')).toBe('set');
    expect(unitBasis("No's")).toBe('no');
    expect(unitBasis('No (6.907 MT)')).toBe('no');
    expect(unitBasis('per Stack')).toBe('no');
    const s = suggestionFor(item('Set (3 Nos.)', [{ unit: 'Set (3 Nos.)', rate: 300 }]), { unit: 'No', section: 'electrical' });
    expect(s.unitMatches).toBe(false);
    expect(s.erectionRate).toBe(0);
    expect(s.notApplied).toHaveLength(1);
    // The same item on a line counted in sets of three takes the labour rate.
    expect(suggestionFor(item('Set (3 Nos.)', [{ unit: 'Set (3 Nos.)', rate: 300 }]), { unit: 'Set (3 Nos)', section: 'electrical' }).erectionRate).toBe(300);
  });

  it('turns a per-tonne erection rate into a rate per No from the line’s tonnage', () => {
    const s = suggestionFor(item('No', [{ unit: 't', rate: 5723 }]), { unit: 'No (6.907289 MT)', qty: 1, section: 'line' });
    expect(s.erectionRate).toBeCloseTo(5723 * 6.907289, 6);
    expect(s.converted).toHaveLength(1);
    expect(s.notApplied).toEqual([]);
    // Without the tonnage it can't be done, so it is listed instead.
    expect(suggestionFor(item('No', [{ unit: 't', rate: 5723 }]), { unit: 'No', qty: 1, section: 'line' }).notApplied).toHaveLength(1);
  });

  it('never wipes out a line’s own erection or T&C rate when the catalog has none in its unit', () => {
    const line = { ...newLine('electrical', 'A1'), unit: 'No', qty: 1, supplyRate: 1, erectionRate: 120_000, testingRate: 70_000 };
    const s = suggestionFor(item('No', [{ unit: 't/m', rate: 80 }], [{ unit: 'No', rate: 14_180 }]), line);
    const out = applySuggestion(line, s);
    expect(out.line).toMatchObject({ supplyRate: 1000, erectionRate: 120_000, testingRate: 14_180 });
    expect(out.kept).toEqual(['erection']);
    // Civil lines take only the supply rate.
    expect(applySuggestion({ ...line, section: 'civil' }, s).line).toMatchObject({ supplyRate: 1000, erectionRate: 0, testingRate: 0 });
  });
});

describe('sizes, cores and units that convert', () => {
  it('reads "4 Core 6.0 Sq.mm" and "4C x 6 Sq mm" as the same cable', () => {
    expect(tokens('4 Core 6.0 Sq.mm')).toEqual(expect.arrayContaining(['4core', '6sqmm']));
    expect(tokens('4C x 6 Sq mm')).toEqual(expect.arrayContaining(['4core', '6sqmm']));
    const s = suggestRates(index, { description: 'Copper control cable 4 Core 6.0 Sq.mm', unit: 'Mtr', section: 'electrical' });
    expect(s[0]!.item.code).toBe('13.8');
  });

  it('converts km against a rate per metre and tonnes against a rate per kg', () => {
    expect(unitFactor('Km', 'Mtr')).toBe(1000);
    expect(unitFactor('Mtr', 'Km')).toBe(0.001);
    expect(unitFactor('MT', 'Kg')).toBe(1000);
    expect(unitFactor('No', 'Km')).toBeNull();
  });
});

describe('reliable matches and labour-only items', () => {
  it('never gives a supply rate to testing, re-erection or excavation items', () => {
    for (const d of ['Testing & Commissioning : Capacitor Bank with Reactors', 'Released and Re-errection of Existing Power Transformers', 'Excavation, formation, refilling', 'Releasing and re-stringing of the Conductor']) expect(isLabourOnly(d)).toBe(true);
    for (const d of ['Power Transformer: a) 20 MVA, 66/11kV', 'Remote Terminal Unit (RTU) - 64 (I/O) Port']) expect(isLabourOnly(d)).toBe(false);
  });

  it('ticks only very close matches whose numbers all agree', () => {
    const line = (description: string) => ({ description, unit: 'Mtrs', section: 'electrical' as const });
    const cable = suggestRates(index, line('COPPER CONTROL CABLE 4C x 2.5 Sq mm'), 1)[0]!;
    expect(isReliable(line('COPPER CONTROL CABLE 4C x 2.5 Sq mm'), cable)).toBe(true);
    // A different size is a different item, however close the words.
    expect(isReliable(line('COPPER CONTROL CABLE 4C x 99 Sq mm'), cable)).toBe(false);
    expect(isReliable(line('Excavation, formation, refilling'), cable)).toBe(false);
  });
});

describe('wording that changes the item (tested on 21 KPTCL estimate workbooks)', () => {
  it('tells "without earth switch" from "with earth switch"', () => {
    const s = suggestRates(index, { description: 'Upright without Earth Switch (Live Point Height 4600 mm)', group: '66 kV, 1250 A, 40 KA Class Double Break isolator', unit: 'Set', section: 'electrical' }, 1);
    expect(s[0]!.item.code).toBe('9.13.2');
  });

  it('reads plurals, PT for VT and a 72.5 kV breaker as a 66 kV one', () => {
    expect(tokens('Copper Control Cables')).toEqual(expect.arrayContaining(['cable']));
    expect(tokens('Potential Transformer')).toContain('vt');
    expect(highestKv('For 66KV Line 72.5KV, 2500 A, 40KA Class')).toBe(66);
  });

  it('prices towers in MT from the tower steel rate, not bolts and nuts, and ignores notes', () => {
    const tower = suggestRates(index, { description: "a) Normal Tower Type 'NB DC - A'", group: 'Fabrication and Supply of galvanised 110kV DC Narrow Based KPTCL Design Transmission Line Towers', unit: 'MT', section: 'line' }, 1);
    expect(tower[0]!.item.code).toBe('18.2');
    const coyote = suggestRates(index, { description: 'Coyote ACSR conductor with 1.5% sag. Note: 1) For Stringing 2nd Circuit : =6.634*3*1.015 = 20.201 Km.', unit: 'Kms', section: 'line' }, 1);
    expect(coyote[0]!.item.item).toMatch(/Coyote ACSR/);
    expect(coyote[0]!.supplyRate).toBe(139000);
  });

  it('does not tick hardware made for another conductor', () => {
    const line = { description: 'Mid Span Compression Joint', unit: 'Nos', section: 'line' as const, group: 'Accessories for Coyote ACSR' };
    const moose = suggestRates(index, { ...line, group: '' }, 5).find((x) => /Moose/.test(x.item.item))!;
    expect(isReliable(line, moose)).toBe(false);
  });
});
