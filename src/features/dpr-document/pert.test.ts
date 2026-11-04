import { row } from '@/test/fixtures';
import { criticalPath, defaultPert, PERT_PRESETS, pertMilestones, pertProblems, planFromPreset } from './pert';

describe('PERT schedule, following the KPTCL PERT chart generator', () => {
  it('picks the standard schedule from the type of work', () => {
    const aug = defaultPert(row({ voltage: '110 kV', capacity: '1x20 MVA', stream: 'Brownfield' }), false);
    expect(aug.completionMonths).toBe(6);
    expect(aug.activities.filter((a) => !a.preAward).map((a) => a.months)).toEqual([1, 4, 1]);
    expect(aug.caseText).toMatch(/^Augmentation — 6 months from the date of LOI \/ Award/);
    expect(criticalPath(aug)).toBe('Stage-I → Stage-II → Stage-III — sequential, zero float across 6 months.');
    expect(pertMilestones(aug).map((m) => [m.month, m.label])).toEqual([[0, 'LOI / Award — zero date'], [1, 'Foundation ready'], [5, 'Supplies & structures complete'], [6, 'Transformer charged']]);

    const ehv = defaultPert(row({ voltage: '220 kV', capacity: '1x100 MVA', stream: 'Brownfield' }), false);
    expect([ehv.completionMonths, ...ehv.activities.filter((a) => !a.preAward).map((a) => a.months)]).toEqual([18, 4, 10, 4]);

    const line = defaultPert(row({ voltage: '66 kV', capacity: '', stream: 'Brownfield' }), true, true);
    expect([line.kind, line.completionMonths, line.caseText]).toEqual(['Transmission line work', 12, '66 kV — 12 months from the date of LOI / Award.']);

    const fresh = defaultPert(row({ voltage: '66 kV', capacity: '1x20 MVA', stream: 'Greenfield' }), true);
    expect(fresh.completionMonths).toBe(12);
    for (const p of [aug, ehv, line, fresh]) expect(pertProblems(p)).toEqual([]);
  });

  it('lays a preset end to end and leaves out the pre-award rows when the preset carries them inside Stage-I', () => {
    for (const preset of PERT_PRESETS) {
      const p = planFromPreset(preset, 'scope');
      expect(pertProblems(p)).toEqual([]);
      expect(p.completionMonths).toBe(preset.stages.reduce((s, x) => s + x.months, 0));
    }
    const kanakapura = planFromPreset(PERT_PRESETS.find((p) => p.label.startsWith('Kanakapura'))!, 'scope');
    expect(kanakapura.activities.some((a) => a.preAward)).toBe(false);
    expect(kanakapura.provisional).toBe(true);
  });
});
