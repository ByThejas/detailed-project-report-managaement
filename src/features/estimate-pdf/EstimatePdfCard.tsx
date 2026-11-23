import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import type { Estimate } from '@/features/preparation/types';
import type { DprRow } from '@/features/reports/types';
import { EstimatePdfEditor } from './EstimatePdfEditor';

/** Generate DPR step: the abstracts and estimate sheets as a print-ready PDF, laid out in an editor first. */
export function EstimatePdfCard({ dpr, estimate, open: openProp, onOpenChange }: { dpr: DprRow; estimate: Estimate; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own;
  const setOpen = onOpenChange ?? setOwn;
  const items = estimate.lines.filter((l) => (l.qty || 0) !== 0).length;
  return (
    <Card role="region" aria-labelledby="estimate-pdf-title">
      <CardHeader
        id="estimate-pdf-title"
        title="Abstract & Estimate"
        subtitle="The general abstract, abstracts and BOQ sheets from the Excel download in KPTCL’s printed estimate format (Bookman, boxed headings, Letter landscape). Adjust lines, text size, borders, rows and columns before downloading."
        action={
          <button type="button" className="btn-primary" onClick={() => setOpen(true)} disabled={!items}>
            <FileDown className="h-3.5 w-3.5" aria-hidden />
            Open PDF editor
          </button>
        }
      />
      <p className="px-4 py-3 text-xs text-gray-500">
        {items
          ? `${items} items with a quantity. The layout is a placeholder KPTCL style until the standard format is supplied; your adjustments are kept for this DPR.`
          : 'The estimate has no items with a quantity yet. Import the BOQ estimate first.'}
      </p>
      {open && <EstimatePdfEditor dpr={dpr} estimate={estimate} onClose={() => setOpen(false)} />}
    </Card>
  );
}
