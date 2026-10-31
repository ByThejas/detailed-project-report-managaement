import { useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatNumber } from '@/lib/format';
import { generalAbstract } from './calc';
import { ANALYSIS_YEARS, DEFAULT_FINANCIALS, parsePastedNumbers, summariseFinancials } from './finance';
import { NumberInput } from './NumberInput';
import type { Estimate } from './types';

const years = (n: number | null) => (n === null ? 'Not within the period' : `${n} ${n === 1 ? 'year' : 'years'}`);

export function CostBenefitCard({ e, onChange }: { e: Estimate; onChange: (e: Estimate) => void }) {
  const f = e.financials ?? DEFAULT_FINANCIALS;
  const cost = generalAbstract(e).total;
  const s = summariseFinancials(cost, f);
  const benefits = Array.from({ length: ANALYSIS_YEARS }, (_, i) => f.benefits[i] ?? 0);
  const filled = f.benefits.filter((b) => b > 0).length;
  const [paste, setPaste] = useState('');
  const [pasteNote, setPasteNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const set = (next: Partial<typeof f>) => onChange({ ...e, financials: { ...f, ...next } });
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
          <NumberInput label="Discount rate %" value={f.discountRatePct} onChange={(n) => set({ discountRatePct: n })} className="w-16 border-gray-200" />
        </label>
        <div>
          <p className="label-muted mb-1.5">Benefit by year, Rs lakh</p>
          <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 sm:grid-cols-5 lg:grid-cols-10">
            {benefits.map((b, i) => (
              <label key={i} className="flex flex-col text-[11px] text-gray-500">
                Year {i + 1}
                <NumberInput label={`Benefit year ${i + 1}`} value={b} onChange={(n) => setYear(i, n)} className="w-full border-gray-200" />
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
