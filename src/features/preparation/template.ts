import type { Estimate, EstimateLine } from './types';

/**
 * Starting BOQ for a transformer replacement / augmentation, taken line by line from the
 * Kogali DPR (2×8 → 2×20 MVA, 66/11 kV; Common SoR 2023-24, Vol-6). Quantities scale with the
 * number of transformers. Rates are the sample's and must be checked against the current SoR.
 */
const LV_BY_HV: Record<string, string> = { '66': '11', '110': '11', '220': '66', '400': '220' };

/** Transformer supply rates we have seen, Rs per unit, keyed by "<hv>/<mva>". */
const TRANSFORMER_RATES: Record<string, { supply: number; erection: number; testing: number }> = {
  '66/20': { supply: 31_247_000, erection: 215_836.4, testing: 71_159 },
};

let seq = 0;
const id = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

type Seed = Omit<EstimateLine, 'id' | 'section' | 'erectionRate' | 'testingRate'> & Partial<Pick<EstimateLine, 'erectionRate' | 'testingRate'>>;
const el = (s: Seed): EstimateLine => ({ erectionRate: 0, testingRate: 0, ...s, id: id(), section: 'electrical' });
const cv = (code: string, description: string, unit: string, qty: number, rate: number): EstimateLine => ({
  id: id(),
  section: 'civil',
  code,
  description,
  unit,
  qty,
  supplyRate: rate,
  erectionRate: 0,
  testingRate: 0,
});

export const parseCapacity = (capacity: string) => {
  const m = /^(\d+)\s*[x×]\s*([\d.]+)/i.exec(capacity);
  return { units: m ? Number(m[1]) : 1, mva: m ? m[2]! : '' };
};

/**
 * Dismantling of the transformers being replaced, from the Kogali decommissioning sheet. Weights
 * (core-and-winding MT, and MT × metres moved) are the sample's two 8 MVA units and must be taken
 * from the nameplates of the units actually being removed.
 */
const SAMPLE_UNITS = [
  { dismantleMt: 6.45, moveMtM: 591.3, note: '8 MVA unit 1: 6.45 MT; moved 30 m × 19.71 MT' },
  { dismantleMt: 5.6, moveMtM: 434.4, note: '8 MVA unit 2: 5.60 MT; moved 30 m × 14.48 MT' },
];

const dm = (code: string, description: string, unit: string, qty: number, rate: number): EstimateLine => ({
  id: id(),
  section: 'dismantling',
  code,
  description,
  unit,
  qty,
  supplyRate: rate,
  erectionRate: 0,
  testingRate: 0,
});

function dismantlingLines(n: number, lv: string): EstimateLine[] {
  const out: EstimateLine[] = [];
  let k = 1;
  for (let u = 0; u < n; u++) {
    const w = SAMPLE_UNITS[Math.min(u, SAMPLE_UNITS.length - 1)]!;
    out.push(dm(`D${k++}`, `Dismantling of existing power transformer ${u + 1} with accessories (radiators, conservator, HV bushings). Weight from sample (${w.note}); check nameplate`, 'MT', w.dismantleMt, 1_134));
    out.push(dm(`D${k++}`, `Moving transformer ${u + 1} from existing point to storage point (max. 50 m), per MT per metre`, 'MT·m', w.moveMtM, 80));
  }
  out.push(dm(`D${k++}`, `Releasing existing ${lv} kV NCT`, 'Nos', n, 733));
  out.push(dm(`D${k++}`, `Releasing existing ${lv} kV bank CT (outdoor)`, 'Nos', 3 * n, 733));
  out.push(dm(`D${k++}`, 'Dismantling existing NCT structures (0.146 MT each)', 'MT', Math.round(0.146 * n * 1000) / 1000, 5_723));
  out.push(dm(`D${k++}`, `Releasing ${lv} kV, 800 A isolators`, 'Set', n, 1_214));
  return out;
}

export function buildTemplate(dpr: { capacity: string; voltage: string; stream?: string }): Estimate {
  const { units: n, mva } = parseCapacity(dpr.capacity);
  const hv = dpr.voltage.replace(/\s*kV/i, '');
  const lv = LV_BY_HV[hv] ?? '11';
  const tr = TRANSFORMER_RATES[`${hv}/${mva}`] ?? { supply: 0, erection: 0, testing: 0 };

  const lines: EstimateLine[] = [
    el({ code: 'A1 a', description: `Power transformer ${mva} MVA, ${hv}/${lv} kV, Dyn11, OLTC, ONAN/ONAF, with RTCC panel, first oil filling and 10% spare oil`, unit: 'Nos', qty: n, supplyRate: tr.supply, erectionRate: tr.erection, testingRate: tr.testing }),
    el({ code: 'A1 b', description: 'Nitrogen injection fire protection system (NIFPS) incl. soak pit civil works', unit: 'Set', qty: n, supplyRate: 1_141_635 }),
    el({ code: 'A2 a', description: `${lv} kV current transformer 1200-800/1-1-1 A, bank incomer (outdoor)`, unit: 'Nos', qty: 3 * n, supplyRate: 56_870, erectionRate: 989, testingRate: 14_101 / 3 }),
    el({ code: 'A2 b', description: `${lv} kV neutral current transformer 1200-800/1-1-1 A, with erection and grounding`, unit: 'Nos', qty: n, supplyRate: 56_870, erectionRate: 989, testingRate: 14_101 / 3 }),
    el({ code: 'A3', description: `${lv} kV isolator, double break, 1250 A, 25 kA, with bi-metallic connector`, unit: 'Set', qty: n, supplyRate: 51_675, erectionRate: 1_214 }),
    el({ code: 'A4', description: 'NCT mounting structure incl. bolts & nuts (0.146 MT per structure)', unit: 'Nos', qty: n, supplyRate: 22_327.25, erectionRate: 835.56 }),
    el({ code: 'A5', description: 'AC distribution box (outdoor), 750×1350×300 mm, MCCB 100 A incomer', unit: 'Nos', qty: 1, supplyRate: 72_600, erectionRate: 2_466 }),
    el({ code: 'A6', description: '1.1 kV PVC armoured aluminium LT cable, 4C × 25 sq.mm', unit: 'Mtr', qty: 100, supplyRate: 866, erectionRate: 15 }),
    el({ code: 'A7 a', description: '19 core 2.5 sq.mm copper control cable', unit: 'Mtr', qty: 250, supplyRate: 525, erectionRate: 15 }),
    el({ code: 'A7 b', description: '4 core 4.0 sq.mm copper control cable', unit: 'Mtr', qty: 300, supplyRate: 177, erectionRate: 15 }),
    el({ code: 'A8', description: 'Earthmat: grounding of equipment with 50×6 mm GI flat to earthmat', unit: 'RMtr', qty: 100, supplyRate: 0, erectionRate: 335 }),
    el({ code: 'A9 a', description: 'Street-light lattice structure with GI pipe for LED lamp, 8.5 m', unit: 'Nos', qty: 2, supplyRate: 27_144.115, erectionRate: 1_093.665 }),
    el({ code: 'A9 b', description: 'Outdoor thermoplastic modular panel enclosure (IP65) for lighting control', unit: 'Each', qty: 1, supplyRate: 20_540 }),
    el({ code: 'A9 c', description: '1.1 kV PVC copper control cable 2C × 6 sq.mm', unit: 'Mtr', qty: 200, supplyRate: 154, erectionRate: 15 }),
    el({ code: 'A9 d', description: 'LED street-light luminaire 200 W', unit: 'Nos', qty: 4, supplyRate: 19_094 }),
    el({ code: 'A10', description: 'Equipment and earthing name plates incl. fixing', unit: 'Nos', qty: 2, supplyRate: 416 }),

    cv('B1', 'Earthwork excavation for foundation by mechanical means, all soils, depth up to 3 m', 'Cum', 2.662, 102),
    cv('B2', 'Cement concrete levelling course 1:3:6, 20 mm graded crushed aggregate', 'Cum', 0.5, 6_147),
    cv('B3', 'M25 design mix concrete for foundations, 20 mm aggregate', 'Cum', 1.5, 6_413.81),
    cv('B4', 'TMT Fe 550/550D steel reinforcement, all other structures', 'Kg', 80, 69.749),
    cv('B5', 'Filling available excavated earth in layers ≤ 20 cm, lead 50 m', 'Cum', 2.662, 266),
  ];

  // A greenfield (new) substation has no sample item list yet, so its BOQ comes only from the imported workbooks.
  const greenfield = dpr.stream === 'Greenfield';
  if (!greenfield) lines.push(...dismantlingLines(n, lv));

  return {
    lines: greenfield ? [] : lines,
    misc: { supply: 0, erection: 0, testing: 0, civil: 0, dismantling: 0 },
    areaLoadingPct: 5,
    gstPct: 18,
    statutoryCharges: 50_000,
    dismantlingStatutory: 0,
    templateCapacity: `${dpr.capacity} ${dpr.voltage}`,
    updatedAt: new Date().toISOString(),
  };
}

export const newLine = (section: EstimateLine['section'], code: string): EstimateLine => ({
  id: id(),
  section,
  code,
  description: '',
  unit: 'Nos',
  qty: 1,
  supplyRate: 0,
  erectionRate: 0,
  testingRate: 0,
});
