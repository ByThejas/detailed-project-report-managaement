import catalog from '@/data/rateCatalog.json';
import { newLine } from '@/features/preparation/template';
import { buildIndex, exactCodeMatch, suggestRates } from './match';
import { choiceKey, forgetChoices, recalledChoices, rememberChoices, rememberedCount } from './memory';
import type { RateCatalog } from './types';

const index = buildIndex(catalog as RateCatalog);
const line = (description: string, unit = 'Nos', group = '') => ({ ...newLine('line', 'L1'), description, unit, group, qty: 10 });

describe('remembered rate choices', () => {
  it('treats wording that differs only in order, case and plurals as the same item', () => {
    expect(choiceKey(line('Vibration dampers', 'Nos'))).toBe(choiceKey(line('vibration Damper', "No's")));
    expect(choiceKey(line('Vibration dampers', 'Nos', 'Hardware for HPC on existing towers'))).not.toBe(choiceKey(line('Vibration dampers', 'Nos', 'Hardware for HPC on new towers')));
    expect(choiceKey(line('Vibration dampers', 'Nos'))).not.toBe(choiceKey(line('Vibration dampers', 'km')));
  });

  it('offers the item chosen before, priced for the new line, until forgotten', () => {
    const first = line('Repair rod', 'No.', 'Hardware for HPC conductor on existing towers');
    // Say the user picked the existing-tower item (44.7.3), not the top suggestion.
    const picked = suggestRates(index, first, 10).find((s) => s.item.code === '44.7.3')!;
    expect(picked).toBeTruthy();
    rememberChoices([{ line: first, suggestion: picked }]);
    const next = { ...line('Repair Rods', 'Nos', 'Hardware for HPC conductor on existing towers'), id: 'next' };
    const got = recalledChoices(index, [next]).get('next')!;
    expect(got).toMatchObject({ remembered: true, supplyRate: picked.supplyRate });
    expect(got.item.code).toBe('44.7.3');
    forgetChoices();
    expect(recalledChoices(index, [next]).size).toBe(0);
  });

  it('does not remember items taken by the line’s own SR code', () => {
    const l = { ...line('Power transformer 12.5 MVA', 'No'), section: 'electrical' as const, srCode: '1.11' };
    rememberChoices([{ line: l, suggestion: exactCodeMatch(index, l)! }]);
    expect(rememberedCount()).toBe(0);
  });
});
