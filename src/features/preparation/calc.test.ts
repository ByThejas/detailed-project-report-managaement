import { abstractOf, generalAbstract, linesMissingRates, sectionTotals } from './calc';
import { buildTemplate } from './template';

describe('estimate', () => {
  // Kogali DPR: 2×20 MVA 66/11 kV. With the sheet's own "misc & rounding" amounts the abstract must match it exactly.
  const kogali = () => {
    const e = buildTemplate({ capacity: '2x20 MVA', voltage: '66 kV' });
    e.misc = { supply: 93_379.27, erection: 5_412.75, testing: 10_079.33, civil: 1_746.25, dismantling: 4_316.18 };
    return e;
  };

  it('reproduces the line totals of the sample estimate', () => {
    const { subTotal } = sectionTotals(kogali());
    expect(subTotal.supply).toBe(65_906_620.73);
    expect(subTotal.testing).toBe(179_920.67);
    expect(subTotal.civil).toBe(19_253.75);
    expect(subTotal.erection).toBe(494_587.25);
  });

  it('reproduces Abstract-I of the sample DPR to the paisa', () => {
    const a = Object.fromEntries(abstractOf(kogali()).map((r) => [r.key, r.lakhs]));
    expect(a).toEqual({
      material: 660,
      labour: 6.9,
      civil: 0.21,
      basic: 667.11,
      loading: 33.36,
      gst: 126.08,
      tender: 826.55,
      statutory: 0.5,
      total: 827.05,
    });
  });

  it('reproduces the dismantling sheet, Abstract-II and the general abstract', () => {
    const e = kogali();
    expect(sectionTotals(e).subTotal.dismantling).toBe(105_683.82);
    expect(sectionTotals(e).total.dismantling).toBe(110_000);
    const a = Object.fromEntries(abstractOf(e, 'II').map((r) => [r.key, r.lakhs]));
    expect(a).toMatchObject({ material: 0, labour: 1.1, civil: 0, basic: 1.1, gst: 0.21, tender: 1.36, statutory: 0, total: 1.36 });
    expect(generalAbstract(e)).toEqual({ capital: 827.05, dismantling: 1.36, total: 828.41 });
  });

  it('starts a greenfield estimate empty, with no dismantling', () => {
    const e = buildTemplate({ capacity: '2x20 MVA', voltage: '66 kV', stream: 'Greenfield' });
    expect(e.lines).toEqual([]);
    expect(generalAbstract(e).dismantling).toBe(0);
  });

  it('scales quantities with the number of transformers and flags unknown transformer rates', () => {
    const e = buildTemplate({ capacity: '3x12.5 MVA', voltage: '110 kV' });
    const tr = e.lines[0]!;
    expect(tr.qty).toBe(3);
    expect(tr.description).toContain('12.5 MVA, 110/11 kV');
    expect(e.lines.find((l) => l.code === 'A2 a')!.qty).toBe(9);
    expect(linesMissingRates(e).map((l) => l.code)).toEqual(['A1 a']);
  });
});
