import { Card, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/lib/toast';
import { contentOf } from '@/features/dpr-document/content';
import type { DprRow } from '@/features/reports/types';
import { DEFAULT_BCR_INPUTS, DEFAULT_FINANCIALS } from './finance';
import { EMPTY_LOAD, lf2, existingCapacityText, loadFigures, mvaAddedText, type LoadData } from './load';
import { NumberInput } from './NumberInput';
import type { Estimate } from './types';

/**
 * Recorded load at the station. Works out the loading factor now and after the work, and offers to put
 * those figures in section 01 and the BCR. Nothing is written until the user clicks.
 */
export function LoadDataCard({ dpr, e, onChange }: { dpr: DprRow; e: Estimate; onChange: (e: Estimate) => void }) {
  const toast = useToast();
  const load = e.load ?? EMPTY_LOAD;
  const set = (patch: Partial<LoadData>) => onChange({ ...e, load: { ...load, ...patch } });
  const f = loadFigures(load, dpr.capacity);
  const bcrMva = e.financials?.inputs?.addedMva ?? 0;

  const fillText = () => {
    if (!f) return;
    const c = contentOf(dpr, e);
    onChange({ ...e, document: { ...c, details: { ...c.details, existingCapacity: existingCapacityText(load, dpr.voltage, f), mvaAdded: mvaAddedText(dpr.capacity, dpr.voltage, f) } } });
    toast({ title: 'Section 01 updated', description: '“Existing capacity” and “MVA added” now use the load data.' });
  };
  const useForBcr = () => {
    if (!f) return;
    const fin = e.financials ?? DEFAULT_FINANCIALS;
    onChange({ ...e, financials: { ...fin, method: fin.method ?? 'kptcl', inputs: { ...(fin.inputs ?? DEFAULT_BCR_INPUTS), addedMva: f.addedMva } } });
    toast({ title: `BCR uses ${f.addedMva} MVA added` });
  };

  return (
    <Card role="region" aria-labelledby="load-title">
      <CardHeader id="load-title" title="Load data" subtitle="From the Transformer & Feeder Load Details. Loading factor = peak MW ÷ (MVA × power factor)." />
      <div className="grid gap-3 px-4 py-3 text-[13px] sm:grid-cols-4">
        <label className="block">
          <span className="label-muted mb-1 block">Existing transformers</span>
          <input className="input" placeholder="e.g. 1x12.5 MVA" value={load.existing} onChange={(ev) => set({ existing: ev.target.value })} />
        </label>
        <label className="block">
          <span className="label-muted mb-1 block">Recorded peak load (MW)</span>
          <NumberInput label="Recorded peak load (MW)" value={load.peakMw} onChange={(n) => set({ peakMw: n })} className="w-full border-gray-200" />
        </label>
        <label className="block">
          <span className="label-muted mb-1 block">Capacity replaced (MVA)</span>
          <NumberInput label="Capacity replaced (MVA)" value={load.replacedMva} onChange={(n) => set({ replacedMva: n })} className="w-full border-gray-200" />
          <span className="block text-[11px] text-gray-400">0 for an additional transformer</span>
        </label>
        <label className="block">
          <span className="label-muted mb-1 block">Power factor</span>
          <NumberInput label="Load power factor" value={load.powerFactor} onChange={(n) => set({ powerFactor: n })} className="w-full border-gray-200" />
        </label>
      </div>
      {f ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-gray-100 px-4 py-3 text-[13px]" role="status" aria-label="Loading factor">
          <span>
            Now: <b className="num">{lf2(f.now)}</b> on {f.existingMva} MVA
          </span>
          <span>
            After the work: <b className="num">{lf2(f.after)}</b> on {f.afterMva} MVA
          </span>
          <span>
            MVA added: <b className="num">{f.addedMva}</b>
            {bcrMva > 0 && bcrMva !== f.addedMva && <span className="text-amber-700"> (BCR uses {bcrMva})</span>}
          </span>
          <span className="ml-auto flex gap-2">
            <button type="button" className="btn-secondary" onClick={fillText}>
              Fill section 01 facts
            </button>
            <button type="button" className="btn-secondary" onClick={useForBcr} disabled={bcrMva === f.addedMva}>
              Use {f.addedMva} MVA for the BCR
            </button>
          </span>
        </div>
      ) : (
        <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">Enter the existing transformers and the recorded peak load to see the loading factor.</p>
      )}
    </Card>
  );
}
