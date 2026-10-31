import { formatNumber, percentOf } from './format';

describe('formatNumber', () => {
  it('uses Indian digit grouping', () => {
    expect(formatNumber(145275.5)).toBe('1,45,275.5');
  });
  it('shows an em dash for missing values', () => {
    expect(formatNumber(null)).toBe('—');
  });
});

describe('percentOf', () => {
  it('rounds to a whole percent', () => {
    expect(percentOf(5, 341)).toBe(1);
    expect(percentOf(336, 341)).toBe(99);
  });
  it('returns 0 when the total is 0', () => {
    expect(percentOf(0, 0)).toBe(0);
  });
});
