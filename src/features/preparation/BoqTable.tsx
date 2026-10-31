import type { CSSProperties } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatNumber } from '@/lib/format';
import { lineAmounts, sectionTotals } from './calc';
import { NumberInput } from './NumberInput';
import { newLine } from './template';
import type { Estimate, EstimateLine, EstimateSection } from './types';

const rupees = (n: number) => formatNumber(Math.round(n * 100) / 100);

interface BoqTableProps {
  section: EstimateSection;
  estimate: Estimate;
  onChange: (e: Estimate) => void;
}

const META = {
  electrical: { title: 'Electrical BOQ (Part A)', subtitle: 'Supply of materials, erection, testing & commissioning · Rs', prefix: 'A' },
  civil: { title: 'Civil BOQ (Part B)', subtitle: 'Civil works · Rs', prefix: 'B' },
  dismantling: { title: 'Dismantling (Abstract-II)', subtitle: 'Decommissioning of the equipment being replaced · Rs', prefix: 'D' },
} as const;

export function BoqTable({ section, estimate, onChange }: BoqTableProps) {
  const lines = estimate.lines.filter((l) => l.section === section);
  const { subTotal, total } = sectionTotals(estimate);
  const electrical = section === 'electrical';
  const meta = META[section];
  // Civil and dismantling have a single rate; their totals and misc live under the section's own key.
  const single = section === 'electrical' ? 'civil' : section;

  const patch = (id: string, change: Partial<EstimateLine>) =>
    onChange({ ...estimate, lines: estimate.lines.map((l) => (l.id === id ? { ...l, ...change } : l)) });
  const remove = (id: string) => onChange({ ...estimate, lines: estimate.lines.filter((l) => l.id !== id) });
  const add = () => onChange({ ...estimate, lines: [...estimate.lines, newLine(section, `${meta.prefix}${lines.length + 1}`)] });
  const setMisc = (key: keyof Estimate['misc'], n: number) => onChange({ ...estimate, misc: { ...estimate.misc, [key]: n } });

  const th = 'px-2 py-2 font-medium';
  const titleId = `${section}-boq-title`;

  return (
    <Card role="region" aria-labelledby={titleId}>
      <CardHeader
        id={titleId}
        title={meta.title}
        subtitle={meta.subtitle}
        action={
          <button type="button" className="btn-secondary" onClick={add}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add item
          </button>
        }
      />
      <div className="overflow-x-auto">
        <table className={`w-full text-[13px] ${electrical ? 'min-w-[1180px]' : 'min-w-[760px]'}`}>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th scope="col" className={`${th} w-16 pl-4`}>Sl. no.</th>
              <th scope="col" className={th}>Description</th>
              <th scope="col" className={`${th} w-16`}>Unit</th>
              <th scope="col" className={`${th} w-24 text-right`}>Qty</th>
              {electrical ? (
                <>
                  <th scope="col" className={`${th} w-28 text-right`}>Supply rate</th>
                  <th scope="col" className={`${th} w-32 text-right`}>Supply amount</th>
                  <th scope="col" className={`${th} w-24 text-right`}>Erection rate</th>
                  <th scope="col" className={`${th} w-28 text-right`}>Erection amount</th>
                  <th scope="col" className={`${th} w-24 text-right`}>T&amp;C rate</th>
                  <th scope="col" className={`${th} w-28 text-right`}>T&amp;C amount</th>
                </>
              ) : (
                <>
                  <th scope="col" className={`${th} w-28 text-right`}>{section === 'civil' ? 'Basic rate' : 'Rate'}</th>
                  <th scope="col" className={`${th} w-32 text-right`}>Amount</th>
                </>
              )}
              <th scope="col" className="w-10 pr-3">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((l) => {
              const a = lineAmounts(l);
              const noRate = l.qty > 0 && l.supplyRate === 0 && l.erectionRate === 0 && l.testingRate === 0;
              return (
                <tr key={l.id} className={`align-top ${noRate ? 'bg-amber-50/60' : ''}`}>
                  <td className="py-1.5 pl-4 pr-2">
                    <input
                      aria-label="Item number"
                      value={l.code}
                      onChange={(e) => patch(l.id, { code: e.target.value })}
                      className="num h-7 w-14 rounded border border-transparent bg-transparent px-1 text-gray-600 hover:border-gray-200 focus:border-accent-500 focus:bg-white focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <textarea
                      aria-label={`Description of ${l.code}`}
                      rows={2}
                      value={l.description}
                      placeholder="Describe the item"
                      onChange={(e) => patch(l.id, { description: e.target.value })}
                      style={{ fieldSizing: 'content' } as CSSProperties}
                      className="block min-h-[2.75rem] w-full min-w-[16rem] resize-y rounded border border-transparent bg-transparent px-1.5 py-1 leading-snug text-gray-900 hover:border-gray-200 focus:border-accent-500 focus:bg-white focus:outline-none"
                    />
                    {l.source && <p className="px-1.5 text-xs text-gray-400">From {l.source}</p>}
                    {noRate && <p className="px-1.5 text-xs text-amber-700">Rate needed</p>}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      aria-label={`Unit of ${l.code}`}
                      value={l.unit}
                      onChange={(e) => patch(l.id, { unit: e.target.value })}
                      className="h-7 w-14 rounded border border-transparent bg-transparent px-1 text-gray-600 hover:border-gray-200 focus:border-accent-500 focus:bg-white focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <NumberInput label={`Quantity of ${l.code}`} value={l.qty} onChange={(qty) => patch(l.id, { qty })} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <NumberInput label={`${electrical ? 'Supply rate' : 'Rate'} of ${l.code}`} value={l.supplyRate} onChange={(supplyRate) => patch(l.id, { supplyRate })} className="w-28" />
                  </td>
                  <td className="num px-2 py-2 text-right text-gray-900">{rupees(a.supply)}</td>
                  {electrical && (
                    <>
                      <td className="px-2 py-1.5 text-right">
                        <NumberInput label={`Erection rate of ${l.code}`} value={l.erectionRate} onChange={(erectionRate) => patch(l.id, { erectionRate })} />
                      </td>
                      <td className="num px-2 py-2 text-right text-gray-900">{rupees(a.erection)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <NumberInput label={`Testing rate of ${l.code}`} value={l.testingRate} onChange={(testingRate) => patch(l.id, { testingRate })} />
                      </td>
                      <td className="num px-2 py-2 text-right text-gray-900">{rupees(a.testing)}</td>
                    </>
                  )}
                  <td className="py-1.5 pr-3 text-right">
                    <button type="button" aria-label={`Remove ${l.code}`} className="btn-ghost h-7 w-7 px-0 text-gray-400 hover:text-rose-600" onClick={() => remove(l.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={electrical ? 11 : 7} className="px-4 py-8 text-center text-gray-500">
                  No items. Use “Add item” to start.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t border-gray-200 text-[13px]">
            <tr>
              <td colSpan={4} className="py-2 pl-4 pr-2 text-right text-gray-500">Sub total</td>
              {electrical ? (
                <>
                  <td />
                  <td className="num px-2 py-2 text-right">{rupees(subTotal.supply)}</td>
                  <td />
                  <td className="num px-2 py-2 text-right">{rupees(subTotal.erection)}</td>
                  <td />
                  <td className="num px-2 py-2 text-right">{rupees(subTotal.testing)}</td>
                </>
              ) : (
                <>
                  <td />
                  <td className="num px-2 py-2 text-right">{rupees(subTotal[single])}</td>
                </>
              )}
              <td />
            </tr>
            <tr>
              <td colSpan={4} className="py-1 pl-4 pr-2 text-right text-gray-500">
                {electrical ? 'Miscellaneous and unforeseen' : section === 'civil' ? 'Rounding off' : 'Miscellaneous'}
              </td>
              {electrical ? (
                <>
                  <td />
                  <td className="px-2 py-1 text-right">
                    <NumberInput label="Miscellaneous supply amount" value={estimate.misc.supply} onChange={(n) => setMisc('supply', n)} className="w-28" />
                  </td>
                  <td />
                  <td className="px-2 py-1 text-right">
                    <NumberInput label="Miscellaneous erection amount" value={estimate.misc.erection} onChange={(n) => setMisc('erection', n)} />
                  </td>
                  <td />
                  <td className="px-2 py-1 text-right">
                    <NumberInput label="Miscellaneous testing amount" value={estimate.misc.testing} onChange={(n) => setMisc('testing', n)} />
                  </td>
                </>
              ) : (
                <>
                  <td />
                  <td className="px-2 py-1 text-right">
                    <NumberInput
                      label={section === 'civil' ? 'Civil rounding off' : 'Dismantling miscellaneous'}
                      value={estimate.misc[single] ?? 0}
                      onChange={(n) => setMisc(single, n)}
                      className="w-28"
                    />
                  </td>
                </>
              )}
              <td />
            </tr>
            <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
              <td colSpan={4} className="py-2 pl-4 pr-2 text-right">Total</td>
              {electrical ? (
                <>
                  <td />
                  <td className="num px-2 py-2 text-right">{rupees(total.supply)}</td>
                  <td />
                  <td className="num px-2 py-2 text-right">{rupees(total.erection)}</td>
                  <td />
                  <td className="num px-2 py-2 text-right">{rupees(total.testing)}</td>
                </>
              ) : (
                <>
                  <td />
                  <td className="num px-2 py-2 text-right">{rupees(total[single])}</td>
                </>
              )}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
