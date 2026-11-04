import { DEFAULT_BCR_INPUTS, benefitCostRatio, hasBcrInputs, internalRateOfReturn, kptclAppraisal, parsePastedNumbers, paybackYear, summariseFinancials } from './finance';

// Benefit row of the Kogali BCR sheet (Rs lakh), years 1–10 as printed, later years escalating 3% at full load.
const kogali = (() => {
  const b = [40.72, 86.83, 138.9, 197.58, 263.59, 337.71, 420.82, 513.87, 617.92, 734.15];
  const f10 = 734.15 / 70.86;
  for (let n = 11; n <= 30; n++) b.push(73.27 * f10 * 1.03 ** (n - 10));
  return b;
})();

describe('financials', () => {
  it('reproduces the sample DPR: IRR 29%, payback 7 years discounted', () => {
    const s = summariseFinancials(828.41, { discountRatePct: 10, benefits: kogali });
    expect(Math.floor(s.irr! * 100)).toBe(29);
    expect(s.discountedPayback).toBe(7);
    expect(s.payback).toBe(6);
    expect(s.bcr).toBeCloseTo(5.86, 2);
  });

  it('handles simple cases exactly', () => {
    expect(internalRateOfReturn(100, [110])).toBeCloseTo(0.1, 9);
    expect(benefitCostRatio(100, { discountRatePct: 0, benefits: [50, 50, 50] })).toBe(1.5);
    expect(paybackYear(100, [40, 40, 40])).toBe(3);
    expect(paybackYear(100, [10, 10])).toBeNull();
    expect(internalRateOfReturn(100, [])).toBeNull();
    expect(benefitCostRatio(0, { discountRatePct: 10, benefits: [1] })).toBeNull();
  });

  it('reads numbers pasted from an Excel row or column', () => {
    expect(parsePastedNumbers('40.72\t86.83\t1,218.11')).toEqual({ values: [40.72, 86.83, 1218.11], rejected: [] });
    expect(parsePastedNumbers('40.72\n86.83\r\n\nabc')).toEqual({ values: [40.72, 86.83], rejected: ['abc'] });
    expect(parsePastedNumbers('1,61,107.5 1,65,985')).toEqual({ values: [161107.5, 165985], rejected: [] });
  });
});

describe('KPTCL BCR method', () => {
  // Input parameters printed on the Thyavanige DPR's BCR annexure.
  const thyavanige = { ...DEFAULT_BCR_INPUTS, addedMva: 20, salePrice: 8.96, transmissionCharge: 0.79, loadGrowthPct: 8, discountRatePct: 9, omPct: 1, escalationPct: 3 };

  it('reproduces the Thyavanige DPR: B/C 3.46, IRR 22%, payback 9 years', () => {
    const a = kptclAppraisal(1231.59, thyavanige)!;
    expect(a.capacityMu).toBeCloseTo(61.057, 3);
    expect(a.schedule[0]!.additionalSaleMu).toBeCloseTo(4.885, 3);
    expect(a.schedule[0]!.income).toBeCloseTo(38.59, 2);
    expect(a.schedule[0]!.cashFlow).toBeCloseTo(26.27, 2);
    expect(a.schedule[8]!.cumulative).toBeCloseTo(157.36, 0);
    expect(a.schedule[29]!.cumulative).toBeCloseTo(3463.51, 0);
    expect(a.npvBenefits).toBeCloseTo(4695.1, 0);
    expect(a.npvCapital).toBeCloseTo(1358.12, 1);
    expect(a.bcr.toFixed(2)).toBe('3.46');
    expect(a.bcrMethod1.toFixed(2)).toBe('3.81');
    expect(Math.round(a.irr! * 100)).toBe(22);
    expect(a.payback).toBe(9);
    expect(a.breakEven!).toBeGreaterThan(8);
    expect(a.breakEven!).toBeLessThan(9);
    expect(Math.round(a.totalIncome)).toBe(20601);
  });

  it('takes MCR as the trough of the cumulative DCF, as the BCR calculator does, when early years run at a loss', () => {
    // A weak case: 2 MVA on a Rs 900 lakh project, 3% growth, 12% discount. The BCR calculator gives MCR 917.19 and method 1 0.12.
    const a = kptclAppraisal(900, { ...DEFAULT_BCR_INPUTS, addedMva: 2, salePrice: 9.54, transmissionCharge: 0.744, loadGrowthPct: 3, discountRatePct: 12, omPct: 1 })!;
    expect(a.mcr).toBeCloseTo(917.19, 2);
    expect(a.bcrMethod1).toBeCloseTo(0.1202, 4);
    expect(a.bcr).toBeCloseTo(0.0957, 4);
    expect(a.payback).toBeNull();
    expect(a.breakEven).toBeNull();
  });

  it('matches the BCR calculator on its Thokkottu example: B/C 4.44', () => {
    const a = kptclAppraisal(498.99, { ...DEFAULT_BCR_INPUTS, addedMva: 12.5, energySavingsMu: 0.3194, salePrice: 9.54, transmissionCharge: 0.744, loadGrowthPct: 10, discountRatePct: 12, omPct: 1 })!;
    expect(a.bcr).toBeCloseTo(4.4363, 4);
    expect(a.bcrMethod1).toBeCloseTo(4.7937, 4);
    expect(a.schedule[29]!.cumulative).toBeCloseTo(1893.01, 2);
  });

  it('feeds the summary when the DPR uses the KPTCL method, and needs MVA or savings', () => {
    const s = summariseFinancials(1231.59, { method: 'kptcl', inputs: thyavanige, discountRatePct: 10, benefits: [] });
    expect(s.bcr!.toFixed(2)).toBe('3.46');
    expect(s.discountedPayback).toBe(9);
    expect(hasBcrInputs({ method: 'kptcl', inputs: DEFAULT_BCR_INPUTS, discountRatePct: 10, benefits: [] })).toBe(false);
    expect(summariseFinancials(1231.59, { method: 'kptcl', inputs: DEFAULT_BCR_INPUTS, discountRatePct: 10, benefits: [] }).bcr).toBeNull();
  });
});
