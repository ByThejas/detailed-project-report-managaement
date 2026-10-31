import { newLine } from '@/features/preparation/template';
import type { EstimateLine } from '@/features/preparation/types';
import type { BoqReadResult, ParsedItem } from './types';

/** A reviewed item as a BOQ line, remembering the file and row it came from. */
export function toEstimateLine(item: ParsedItem, read: BoqReadResult): EstimateLine {
  return {
    ...newLine(read.section, item.code),
    description: item.heading ? `${item.heading} — ${item.description}` : item.description,
    unit: item.unit,
    qty: item.qty ?? 0,
    supplyRate: item.supplyRate,
    erectionRate: read.section === 'electrical' ? item.erectionRate : 0,
    testingRate: read.section === 'electrical' ? item.testingRate : 0,
    source: `${read.fileName} · ${item.sheet} row ${item.row}`,
  };
}
