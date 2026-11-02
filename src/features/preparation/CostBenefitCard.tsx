import { useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatNumber } from '@/lib/format';
import { generalAbstract } from './calc';
import { ANALYSIS_YEARS, DEFAULT_BCR_INPUTS, DEFAULT_FINANCIALS, kptclAppraisal, mvaFromCapacity, parsePastedNumbers, summariseFinancials, type BcrInputs, type Financials } from './finance';
import { NumberInput } from './NumberInput';
import type { Estimate } from './types';

const years = (n: number | null) => (n === null ? 'Not within the period' : `${n} ${n === 1 ? 'year' : 'years'}`);

const INPUT_FIELDS: { key: keyof BcrInputs; label: string; unit: string; hint: string }[] = [
  { key: 'addedMva', label: 'Additional load after enhancement', unit: 'MVA', hint: 'Net additional MVA on the station.' },
  { key: 'energySavingsMu', label: 'Energy savings', unit: 'MU', hint: 'For new stations where savings are derived; usually 0.' },
  { key: 'salePrice', label: 'Sale price of energy', unit: 'Rs/unit', hint: 'ESCOM sale price, fixed each financial year.' },
  { key: 'transmissionCharge', label: 'Transmission charges', unit: 'Rs/unit', hint: 'KPTCL charges, fixed each financial year.' },
  { key: 'loadGrowthPct', label: 'Load growth', unit: '%', hint: 'Per local growth trend.' },
  { key: 'discountRatePct', label: 'Discount rate', unit: '%', hint: 'Typically 9–12% depending on financing.' },
  { key: 'omPct', label: 'O&M cost', unit: '% of cost', hint: 'Normally 1% of project cost per year.' },
  { key: 'escalationPct', label: 'Escalation on charges', unit: '% / year', hint: 'Applied to sale price and transmission charges.' },
  { key: 'powerFactor', label: 'Power factor', unit: '', hint: 'With load factor, turns MVA into MU.' },
  { key: 'loadFactor', label: 'Load factor', unit: '', hint: '0.85 × 0.41 matches the KPTCL workbook.' },
];

const fmt = (n: number, d = 2) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

interface CardProps {
  e: Estimate;
  onChange: (e: Estimate) => void;
  /** The DPR's capacity, offered as the added MVA. */
  capacity?: string;
}

export function CostBenefitCard({ e, onChange, capacity = '' }: CardProps) {
  const f: Financials = e.financials ?? DEFAULT_FINANCIALS;
  const method = f.method ?? 'manual';
  const setMethod = (m: 'kptcl' | 'manual') => onChange({ ...e, financials: { ...f, method: m, inputs: f.inputs ?? DEFAULT_BCR_INPUTS } });
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="BCR method" className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 text-[13px]">
        {(
          [
            ['kptcl', 'KPTCL BCR method (from inputs)'],
            ['manual', 'Enter yearly benefits by hand'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={method === key}
            onClick={() => setMethod(key)}
            className={`rounded px-3 py-1.5 ${method === key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {method === 'kptcl' ? <KptclBcrCard e={e} f={f} onChange={onChange} capacity={capacity} /> : <ManualBenefitsCard e={e} onChange={onChange} />}
    </div>
  );
}

function KptclBcrCard({ e, f, onChange, capacity }: { e: Estimate; f: Financials; onChange: (e: Estimate) => void; capacity: string }) {
  const inputs = f.inputs ?? DEFAULT_BCR_INPUTS;
  const cost = generalAbstract(e).total;
  const a = kptclAppraisal(cost, inputs);
  const ready = a && inputs.addedMva + inputs.energySavingsMu > 0;
  const suggested = mvaFromCapacity(capacity);
  const set = (patch: Partial<BcrInputs>) => onChange({ ...e, financials: { ...f, method: 'kptcl', inputs: { ...inputs, ...patch } } });
  const results = [
    { label: 'Benefit-cost ratio', value: ready ? a.bcr.toFixed(2) : '—', note: ready ? (a.bcr >= 1 ? 'Viable (≥ 1.00)' : 'Not viable (< 1.00)') : '' },
    { label: 'Internal rate of return', value: ready && a.irr !== null ? `${Math.round(a.irr * 100)}%` : '—', note: `vs. ${inputs.discountRatePct}% discount rate` },
    { label: 'Payback period', value: ready ? years(a.payback) : '—', note: 'Years (discounted)' },
    { label: 'Project cost', value: `${fmt(cost)} L`, note: 'From the general abstract' },
  ];
  return (
    <Card role="region" aria-labelledby="cba-title">
      <CardHeader id="cba-title" title="Cost-benefit analysis" subtitle="KPTCL BCR workbook method · 30-year horizon · Rs lakh" />
      <dl className="grid grid-cols-2 gap-px border-b border-gray-200 bg-gray-200 lg:grid-cols-4" aria-label="Cost-benefit results">
        {results.map((r) => (
          <div key={r.label} className="bg-white px-4 py-3">
            <dt className="text-xs text-gray-500">{r.label}</dt>
            <dd className="num mt-0.5 text-lg font-semibold text-gray-900">{r.value}</dd>
            {r.note && <dd className="text-[11px] text-gray-500">{r.note}</dd>}
          </div>
        ))}
      </dl>
      <div className="grid gap-x-6 gap-y-3 px-4 py-3 text-[13px] sm:grid-cols-2 lg:grid-cols-5">
        {INPUT_FIELDS.map((x) => (
          <label key={x.key} className="row-span-3 grid grid-rows-subgrid gap-y-1">
            <span className="label-muted self-end">
              {x.label}
              {x.unit && <span className="text-gray-400"> ({x.unit})</span>}
            </span>
            <NumberInput label={x.label} value={inputs[x.key]} onChange={(n) => set({ [x.key]: n })} boxed warn={x.key === 'addedMva' && !inputs.addedMva} className="w-full" />
            <span className="block text-[11px] leading-snug text-gray-400">{x.hint}</span>
          </label>
        ))}
      </div>
      {!inputs.addedMva && suggested !== null && (
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-4 py-2.5 text-[13px] text-gray-700">
          The DPR capacity is {capacity}. Is the net additional load {suggested} MVA?
          <button type="button" className="btn-secondary" onClick={() => set({ addedMva: suggested })}>
            Use {suggested} MVA
          </button>
        </div>
      )}
      {ready && (
        <>
          <dl className="grid gap-x-6 gap-y-1 border-t border-gray-200 px-4 py-3 text-[13px] sm:grid-cols-2 lg:grid-cols-3" aria-label="Appraisal summary">
            {(
              [
                ['NPV of benefits', `${fmt(a.npvBenefits)} L`],
                ['NPV of capital outflow', `${fmt(a.npvCapital)} L`],
                ['Minimum capital requirement (MCR)', `${fmt(a.mcr)} L`],
                ['B/C: NPV ÷ MCR + 1 (method 1)', a.bcrMethod1.toFixed(2)],
                ['B/C: NPV benefits ÷ NPV capital (method 2)', a.bcr.toFixed(2)],
                ['Total undiscounted income', `${fmt(a.totalIncome, 0)} L`],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-gray-100 py-1">
                <dt className="text-gray-600">{k}</dt>
                <dd className="num text-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
          <details className="border-t border-gray-200 px-4 py-3 text-[13px]">
            <summary className="cursor-pointer text-gray-700">Year-wise schedule (goes into annexure 6 of the DPR)</summary>
            <div className="mt-2 overflow-x-auto relative">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="text-gray-500">
                  <tr>
                    {['Year', 'Energy chg', 'Trans. chg', 'Savings', 'Addl. sale (MU)', 'Addl. savings', 'Income', 'Cash flow', 'Disc. factor', 'Discounted CF', 'Cumulative DCF'].map((h) => (
                      <th key={h} className="py-1 pr-2 text-right font-medium first:text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="num">
                  <tr className="border-t border-gray-100">
                    <td className="py-1">0</td>
                    <td colSpan={6} />
                    <td className="pr-2 text-right">{fmt(-cost)}</td>
                    <td className="pr-2 text-right">1.0000</td>
                    <td className="pr-2 text-right">{fmt(-cost)}</td>
                    <td className="text-right">{fmt(-cost)}</td>
                  </tr>
                  {a.schedule.map((y) => (
                    <tr key={y.year} className={`border-t border-gray-100 ${y.year === a.payback ? 'bg-emerald-50' : ''}`}>
                      <td className="py-1">{y.year}</td>
                      <td className="pr-2 text-right">{fmt(y.energyCharge)}</td>
                      <td className="pr-2 text-right">{fmt(y.transmissionCharge, 3)}</td>
                      <td className="pr-2 text-right">{fmt(y.savings)}</td>
                      <td className="pr-2 text-right">{fmt(y.additionalSaleMu, 3)}</td>
                      <td className="pr-2 text-right">{fmt(y.additionalSavings)}</td>
                      <td className="pr-2 text-right">{fmt(y.income)}</td>
                      <td className="pr-2 text-right">{fmt(y.cashFlow)}</td>
                      <td className="pr-2 text-right">{y.discountFactor.toFixed(4)}</td>
                      <td className="pr-2 text-right">{fmt(y.discountedCashFlow)}</td>
                      <td className="text-right">{fmt(y.cumulative)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </Card>
  );
}

function ManualBenefitsCard({ e, onChange }: { e: Estimate; onChange: (e: Estimate) => void }) {
  const f = e.financials ?? DEFAULT_FINANCIALS;
  const cost = generalAbstract(e).total;
  const s = summariseFinancials(cost, { ...f, method: 'manual' });
  const benefits = Array.from({ length: ANALYSIS_YEARS }, (_, i) => f.benefits[i] ?? 0);
  const filled = f.benefits.filter((b) => b > 0).length;
  const [paste, setPaste] = useState('');
  const [pasteNote, setPasteNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const set = (next: Partial<typeof f>) => onChange({ ...e, financials: { ...f, method: 'manual', ...next } });
  const setYear = (i: number, n: number) => {
    const next = [...benefits];
    next[i] = n;
    set({ benefits: next });
  };
  const applyPaste = () => {
    const { values, rejected } = parsePastedNumbers(paste);
    if (values.length === 0) {
      setPasteNote({ tone: 'warn', text: 'No numbers found. Copy the benefit row (or column) from the BCR sheet and paste it here.' });
      return;
    }
    set({ benefits: values.slice(0, ANALYSIS_YEARS) });
    const notes = [`Filled years 1–${Math.min(values.length, ANALYSIS_YEARS)} from ${values.length} values.`];
    if (values.length !== ANALYSIS_YEARS) notes.push(`Expected ${ANALYSIS_YEARS}; check nothing is missing or extra.`);
    if (rejected.length) notes.push(`Ignored text: ${rejected.slice(0, 5).join(', ')}${rejected.length > 5 ? '…' : ''}.`);
    setPasteNote({ tone: values.length === ANALYSIS_YEARS && !rejected.length ? 'ok' : 'warn', text: notes.join(' ') });
    setPaste('');
  };

  const results = [
    { label: 'Benefit-cost ratio', value: s.bcr === null ? '—' : s.bcr.toFixed(2) },
    { label: 'Internal rate of return', value: s.irr === null ? '—' : `${(s.irr * 100).toFixed(1)}%` },
    { label: 'Payback', value: filled ? years(s.payback) : '—' },
    { label: `Discounted payback (${f.discountRatePct}%)`, value: filled ? years(s.discountedPayback) : '—' },
  ];

  return (
    <Card role="region" aria-labelledby="cba-title">
      <CardHeader id="cba-title" title="Cost-benefit analysis" subtitle={`Project cost Rs ${formatNumber(cost)} lakh from the general abstract · benefits in Rs lakh per year`} />
      <dl className="grid grid-cols-2 gap-px border-b border-gray-200 bg-gray-200 lg:grid-cols-4" aria-label="Cost-benefit results">
        {results.map((r) => (
          <div key={r.label} className="bg-white px-4 py-3">
            <dt className="text-xs text-gray-500">{r.label}</dt>
            <dd className="num mt-0.5 text-lg font-semibold text-gray-900">{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-3 px-4 py-3 text-[13px]">
        <label className="flex items-center gap-1 text-gray-600">
          Discount rate %
          <NumberInput label="Discount rate %" value={f.discountRatePct} onChange={(n) => set({ discountRatePct: n })} boxed className="w-16" />
        </label>
        <div>
          <p className="label-muted mb-1.5">Benefit by year, Rs lakh</p>
          <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 sm:grid-cols-5 lg:grid-cols-10">
            {benefits.map((b, i) => (
              <label key={i} className="flex flex-col text-[11px] text-gray-500">
                Year {i + 1}
                <NumberInput label={`Benefit year ${i + 1}`} value={b} onChange={(n) => setYear(i, n)} boxed className="w-full" />
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="benefit-paste" className="label-muted block">
            Or paste the benefit row from the BCR sheet
          </label>
          <textarea
            id="benefit-paste"
            rows={2}
            value={paste}
            onChange={(ev) => setPaste(ev.target.value)}
            placeholder="40.72	86.83	138.90	…"
            className="input min-h-[3rem] w-full py-1.5"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-secondary" disabled={!paste.trim()} onClick={applyPaste}>
              Fill years from pasted values
            </button>
            {pasteNote && (
              <span role="status" className={pasteNote.tone === 'ok' ? 'text-emerald-700' : 'text-amber-800'}>
                {pasteNote.text}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
